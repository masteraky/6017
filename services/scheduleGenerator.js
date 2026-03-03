const { Personnel, Facilities, Shifts, Constraints, MaxShiftsRules } = require('../models/db');

/**
 * Get ISO week number for a date string (YYYY-MM-DD)
 */
function getWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${weekNum}`;
}

function getMonthKey(dateStr) {
  return dateStr.substring(0, 7); // YYYY-MM
}

function getYearKey(dateStr) {
  return dateStr.substring(0, 4); // YYYY
}

function getPeriodKey(dateStr, periodType) {
  switch (periodType) {
    case 'week':  return getWeekKey(dateStr);
    case 'month': return getMonthKey(dateStr);
    case 'year':  return getYearKey(dateStr);
    default:      return getWeekKey(dateStr);
  }
}

/**
 * Build max-shifts budget per person per period from rules.
 * Returns: Map<personnelId, { maxShifts, periodType }>
 * Priority: person-specific rule > role-level rule
 */
function buildMaxShiftsBudget(rules, allPersonnel) {
  // role-level: roleId -> { maxShifts, periodType }
  const roleRules = {};
  rules.filter(r => r.role_id && !r.personnel_id).forEach(r => {
    roleRules[r.role_id] = { maxShifts: r.max_shifts, periodType: r.period_type };
  });

  // person-level overrides
  const personRules = {};
  rules.filter(r => r.personnel_id).forEach(r => {
    personRules[r.personnel_id] = { maxShifts: r.max_shifts, periodType: r.period_type };
  });

  const budget = {};
  allPersonnel.forEach(p => {
    if (personRules[p.id]) {
      budget[p.id] = personRules[p.id];
    } else if (roleRules[p.role_id]) {
      budget[p.id] = roleRules[p.role_id];
    }
    // No rule = unlimited
  });
  return budget;
}

/**
 * Smart schedule generation with constraint + max-shift awareness.
 */
async function generate(startDate, endDate, facilityIds, periodId) {
  const [allPersonnel, facilities, shifts, allRequirements, maxRules] = await Promise.all([
    Personnel.getAll(),
    Facilities.getAll(),
    Shifts.getAll(),
    Shifts.getAllRequirements(),
    MaxShiftsRules.getAll()
  ]);

  const constraintsList = await Constraints.getForRange(startDate, endDate);

  // Constraint lookup
  const constraintSet = new Set();
  constraintsList.forEach(c => {
    const dateStr = c.constraint_date instanceof Date
      ? c.constraint_date.toISOString().split('T')[0]
      : String(c.constraint_date).split('T')[0];
    if (c.shift_id) {
      constraintSet.add(`${c.personnel_id}_${dateStr}_${c.shift_id}`);
    } else {
      constraintSet.add(`${c.personnel_id}_${dateStr}_ALL`);
    }
  });

  function isConstrained(personnelId, dateStr, shiftId) {
    return (
      constraintSet.has(`${personnelId}_${dateStr}_ALL`) ||
      constraintSet.has(`${personnelId}_${dateStr}_${shiftId}`)
    );
  }

  // Max shifts budget per person
  const maxBudget = buildMaxShiftsBudget(maxRules, allPersonnel);

  // Workload tracker: personnelId -> count (overall)
  const workload = {};
  allPersonnel.forEach(p => { workload[p.id] = 0; });

  // Period workload: personnelId -> periodKey -> count
  const periodWorkload = {};
  allPersonnel.forEach(p => { periodWorkload[p.id] = {}; });

  function getPeriodCount(personnelId, dateStr) {
    const rule = maxBudget[personnelId];
    if (!rule) return 0;
    const key = getPeriodKey(dateStr, rule.periodType);
    return periodWorkload[personnelId][key] || 0;
  }

  function isOverMaxShifts(personnelId, dateStr) {
    const rule = maxBudget[personnelId];
    if (!rule) return false;
    const key = getPeriodKey(dateStr, rule.periodType);
    const count = periodWorkload[personnelId][key] || 0;
    return count >= rule.maxShifts;
  }

  function incrementPeriodWorkload(personnelId, dateStr) {
    const rule = maxBudget[personnelId];
    if (!rule) return;
    const key = getPeriodKey(dateStr, rule.periodType);
    periodWorkload[personnelId][key] = (periodWorkload[personnelId][key] || 0) + 1;
  }

  const targetFacilities = facilities.filter(f => facilityIds.includes(f.id));
  if (!targetFacilities.length) throw new Error('לא נמצאו מתקנים תואמים');
  if (!shifts.length) throw new Error('לא הוגדרו משמרות');

  const dates = getDatesInRange(startDate, endDate);
  const assignments = [];
  const warnings = [];

  for (const dateStr of dates) {
    for (const facility of targetFacilities) {
      for (const shift of shifts) {
        const reqs = allRequirements.filter(r => r.shift_id === shift.id);
        if (!reqs.length) continue;

        let commanderAssigned = false;

        for (const req of reqs) {
          const rolePersonnel = allPersonnel.filter(p => p.role_id === req.role_id);

          // Split into available (no constraint, not over limit) and fallback (over limit but no constraint)
          const available = rolePersonnel.filter(p =>
            !isConstrained(p.id, dateStr, shift.id) &&
            !isOverMaxShifts(p.id, dateStr)
          );
          const overLimitFallback = rolePersonnel.filter(p =>
            !isConstrained(p.id, dateStr, shift.id) &&
            isOverMaxShifts(p.id, dateStr)
          );

          // Sort each group by workload
          const sortByWorkload = (a, b) => (workload[a.id] || 0) - (workload[b.id] || 0) || a.name.localeCompare(b.name);
          available.sort(sortByWorkload);
          overLimitFallback.sort(sortByWorkload);

          const pool = [...available, ...overLimitFallback];
          const toAssign = pool.slice(0, req.count);

          if (toAssign.length < req.count) {
            warnings.push(`⚠️ ${dateStr} - ${facility.name} - ${shift.name}: נדרשים ${req.count} "${req.role_name}", זמינים ${toAssign.length}`);
          }

          for (const person of toAssign) {
            const isCommander = !commanderAssigned && person.is_commander_eligible;
            if (isCommander) commanderAssigned = true;

            assignments.push({
              period_id: periodId,
              assignment_date: dateStr,
              shift_id: shift.id,
              personnel_id: person.id,
              facility_id: facility.id,
              is_commander: isCommander ? 1 : 0
            });

            workload[person.id] = (workload[person.id] || 0) + 1;
            incrementPeriodWorkload(person.id, dateStr);
          }
        }

        // Ensure at least one commander if none assigned
        if (!commanderAssigned) {
          const cmdCandidate = allPersonnel.find(p =>
            p.is_commander_eligible &&
            !isConstrained(p.id, dateStr, shift.id) &&
            !assignments.find(a =>
              a.assignment_date === dateStr &&
              a.shift_id === shift.id &&
              a.facility_id === facility.id &&
              a.personnel_id === p.id
            )
          );
          if (cmdCandidate) {
            assignments.push({
              period_id: periodId,
              assignment_date: dateStr,
              shift_id: shift.id,
              personnel_id: cmdCandidate.id,
              facility_id: facility.id,
              is_commander: 1
            });
            workload[cmdCandidate.id] = (workload[cmdCandidate.id] || 0) + 1;
            incrementPeriodWorkload(cmdCandidate.id, dateStr);
          }
        }
      }
    }
  }

  if (warnings.length > 0) {
    console.warn('Schedule generation warnings:\n' + warnings.join('\n'));
  }

  return assignments;
}

function getDatesInRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  current.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

module.exports = { generate };

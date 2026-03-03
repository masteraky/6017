const express = require('express');
const router = express.Router();
const { Personnel, Shifts, Facilities, Constraints, Schedule, MaxShiftsRules } = require('../models/db');
const { query, sql } = require('../config/db');

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.status(401).json({ success: false, error: 'נדרשת הרשאת מנהל' });
}

// Helpers
function getWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const wn = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${wn}`;
}
function getPeriodKey(dateStr, periodType) {
  if (periodType === 'month') return dateStr.substring(0, 7);
  if (periodType === 'year')  return dateStr.substring(0, 4);
  return getWeekKey(dateStr);
}

async function checkViolations(personnelId, date, shiftId) {
  const [constraints, maxRules, allPersonnel] = await Promise.all([
    Constraints.getByPersonnel(parseInt(personnelId)),
    MaxShiftsRules.getAll(),
    Personnel.getAll()
  ]);

  const person = allPersonnel.find(p => p.id == personnelId);

  // 1. Constraint violation
  const hasConstraint = constraints.some(c => {
    const cDate = c.constraint_date instanceof Date
      ? c.constraint_date.toISOString().split('T')[0]
      : String(c.constraint_date).split('T')[0];
    if (cDate !== date) return false;
    return c.shift_id === null || c.shift_id == shiftId;
  });

  // 2. Max shifts violation — count how many shifts this person already has in the period
  let overMaxShifts = false;
  let maxShiftsInfo = null;

  if (person) {
    const personRule = maxRules.find(r => r.personnel_id == personnelId);
    const roleRule = !personRule ? maxRules.find(r => r.role_id == person.role_id && !r.personnel_id) : null;
    const rule = personRule || roleRule;

    if (rule) {
      const periodKey = getPeriodKey(date, rule.period_type);
      // Count existing assignments in the same period
      const countResult = await query(
        `SELECT COUNT(*) as cnt FROM schedule_assignments sa
         WHERE sa.personnel_id = @pid
         AND sa.assignment_date BETWEEN @sd AND @ed`,
        [
          { name: 'pid', type: sql.Int, value: parseInt(personnelId) },
          { name: 'sd', type: sql.Date, value: new Date(getPeriodStart(date, rule.period_type)) },
          { name: 'ed', type: sql.Date, value: new Date(getPeriodEnd(date, rule.period_type)) }
        ]
      );
      const currentCount = countResult.recordset[0]?.cnt || 0;
      if (currentCount >= rule.max_shifts) {
        overMaxShifts = true;
        maxShiftsInfo = {
          current: currentCount,
          max: rule.max_shifts,
          periodType: rule.period_type
        };
      }
    }
  }

  return { hasConstraint, overMaxShifts, maxShiftsInfo };
}

function getPeriodStart(dateStr, periodType) {
  const d = new Date(dateStr + 'T00:00:00');
  if (periodType === 'week') {
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  }
  if (periodType === 'month') return dateStr.substring(0, 7) + '-01';
  if (periodType === 'year')  return dateStr.substring(0, 4) + '-01-01';
  return dateStr;
}

function getPeriodEnd(dateStr, periodType) {
  const d = new Date(dateStr + 'T00:00:00');
  if (periodType === 'week') {
    const day = d.getDay();
    const diff = d.getDate() + (6 - day);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  }
  if (periodType === 'month') {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return last.toISOString().split('T')[0];
  }
  if (periodType === 'year') return dateStr.substring(0, 4) + '-12-31';
  return dateStr;
}

// ==================== SCHEDULE EDITING ====================

// Get full schedule data for editing
router.get('/schedule/:periodId/edit-data', requireAdmin, async (req, res) => {
  try {
    const periodId = parseInt(req.params.periodId);
    const period = await Schedule.getPeriodById(periodId);
    if (!period) return res.json({ success: false, error: 'סידור לא נמצא' });

    const [assignments, allPersonnel, shifts, facilities] = await Promise.all([
      Schedule.getAssignments(periodId),
      Personnel.getAll(),
      Shifts.getAll(),
      Facilities.getAll()
    ]);

    res.json({ success: true, period, assignments, allPersonnel, shifts, facilities });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Add a person to a shift
router.post('/schedule/:periodId/assignment/add', requireAdmin, async (req, res) => {
  try {
    const { date, shift_id, personnel_id, facility_id, is_commander } = req.body;
    const periodId = parseInt(req.params.periodId);

    const violations = await checkViolations(personnel_id, date, shift_id);

    const insertResult = await query(
      `INSERT INTO schedule_assignments
       (period_id, assignment_date, shift_id, personnel_id, facility_id, is_commander)
       OUTPUT INSERTED.id
       VALUES (@pid, @date, @sid, @pers, @fid, @cmd)`,
      [
        { name: 'pid',  type: sql.Int,  value: periodId },
        { name: 'date', type: sql.Date, value: new Date(date) },
        { name: 'sid',  type: sql.Int,  value: parseInt(shift_id) },
        { name: 'pers', type: sql.Int,  value: parseInt(personnel_id) },
        { name: 'fid',  type: sql.Int,  value: parseInt(facility_id) },
        { name: 'cmd',  type: sql.Bit,  value: is_commander ? 1 : 0 }
      ]
    );

    const newId = insertResult.recordset[0]?.id || null;
    res.json({ success: true, newId, ...violations });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Remove an assignment
router.delete('/schedule/assignment/:id', requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM schedule_assignments WHERE id=@id',
      [{ name: 'id', type: sql.Int, value: parseInt(req.params.id) }]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Toggle commander
router.post('/schedule/assignment/:id/commander', requireAdmin, async (req, res) => {
  try {
    const { is_commander } = req.body;
    await query('UPDATE schedule_assignments SET is_commander=@cmd WHERE id=@id',
      [
        { name: 'id',  type: sql.Int, value: parseInt(req.params.id) },
        { name: 'cmd', type: sql.Bit, value: is_commander ? 1 : 0 }
      ]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Check violations for a person/date/shift
router.get('/check-constraint', async (req, res) => {
  try {
    const { personnel_id, date, shift_id } = req.query;
    const violations = await checkViolations(personnel_id, date, shift_id);
    res.json({ success: true, ...violations });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==================== MAX SHIFTS RULES ====================
router.get('/max-shifts-rules', requireAdmin, async (req, res) => {
  try {
    const rules = await MaxShiftsRules.getAll();
    res.json({ success: true, rules });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/max-shifts-rules', requireAdmin, async (req, res) => {
  try {
    const { role_id, personnel_id, max_shifts, period_type } = req.body;
    const id = await MaxShiftsRules.create(
      role_id ? parseInt(role_id) : null,
      personnel_id ? parseInt(personnel_id) : null,
      parseInt(max_shifts),
      period_type
    );
    res.json({ success: true, id });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.put('/max-shifts-rules/:id', requireAdmin, async (req, res) => {
  try {
    const { max_shifts, period_type } = req.body;
    await MaxShiftsRules.update(parseInt(req.params.id), parseInt(max_shifts), period_type);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.delete('/max-shifts-rules/:id', requireAdmin, async (req, res) => {
  try {
    await MaxShiftsRules.delete(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;

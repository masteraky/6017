const { query, sql } = require('../config/db');

// ==================== SETTINGS ====================
const Settings = {
  async get(key) {
    const r = await query(
      'SELECT key_value FROM settings WHERE key_name = @key',
      [{ name: 'key', type: sql.NVarChar, value: key }]
    );
    return r.recordset[0]?.key_value || null;
  },

  async set(key, value) {
    await query(
      `IF EXISTS (SELECT 1 FROM settings WHERE key_name = @key)
         UPDATE settings SET key_value = @val WHERE key_name = @key
       ELSE
         INSERT INTO settings (key_name, key_value) VALUES (@key, @val)`,
      [
        { name: 'key', type: sql.NVarChar, value: key },
        { name: 'val', type: sql.NVarChar, value: value }
      ]
    );
  },

  async getAll() {
    const r = await query('SELECT key_name, key_value FROM settings');
    const result = {};
    r.recordset.forEach(row => { result[row.key_name] = row.key_value; });
    return result;
  }
};

// ==================== ROLES ====================
const Roles = {
  async getAll() {
    const r = await query('SELECT * FROM roles ORDER BY name');
    return r.recordset;
  },

  async getById(id) {
    const r = await query(
      'SELECT * FROM roles WHERE id = @id',
      [{ name: 'id', type: sql.Int, value: id }]
    );
    return r.recordset[0] || null;
  },

  async create(name, isCommanderEligible = false) {
    const r = await query(
      'INSERT INTO roles (name, is_commander_eligible) OUTPUT INSERTED.id VALUES (@name, @ice)',
      [
        { name: 'name', type: sql.NVarChar, value: name },
        { name: 'ice', type: sql.Bit, value: isCommanderEligible ? 1 : 0 }
      ]
    );
    return r.recordset[0].id;
  },

  async update(id, name, isCommanderEligible) {
    await query(
      'UPDATE roles SET name = @name, is_commander_eligible = @ice WHERE id = @id',
      [
        { name: 'id', type: sql.Int, value: id },
        { name: 'name', type: sql.NVarChar, value: name },
        { name: 'ice', type: sql.Bit, value: isCommanderEligible ? 1 : 0 }
      ]
    );
  },

  async countPersonnel(id) {
    const r = await query('SELECT COUNT(*) AS cnt FROM personnel WHERE role_id = @id',
      [{ name: 'id', type: sql.Int, value: id }]);
    return r.recordset[0].cnt;
  },

  async reassignPersonnel(oldRoleId, newRoleId) {
    await query('UPDATE personnel SET role_id = @newId WHERE role_id = @oldId', [
      { name: 'newId', type: sql.Int, value: newRoleId },
      { name: 'oldId', type: sql.Int, value: oldRoleId }
    ]);
  },

  async delete(id) {
    await query('DELETE FROM roles WHERE id = @id',
      [{ name: 'id', type: sql.Int, value: id }]);
  }
};

// ==================== PERSONNEL ====================
const Personnel = {
  async getAll() {
    const r = await query(
      `SELECT p.*, r.name as role_name, r.is_commander_eligible,
              f.name as preferred_facility_name
       FROM personnel p
       JOIN roles r ON p.role_id = r.id
       LEFT JOIN facilities f ON p.preferred_facility_id = f.id
       WHERE p.is_active = 1
       ORDER BY r.name, p.name`
    );
    return r.recordset;
  },

  async getById(id) {
    const r = await query(
      `SELECT p.*, r.name as role_name, r.is_commander_eligible,
              f.name as preferred_facility_name
       FROM personnel p
       JOIN roles r ON p.role_id = r.id
       LEFT JOIN facilities f ON p.preferred_facility_id = f.id
       WHERE p.id = @id`,
      [{ name: 'id', type: sql.Int, value: id }]
    );
    return r.recordset[0] || null;
  },

  async create(name, roleId, preferredFacilityId) {
    const r = await query(
      'INSERT INTO personnel (name, role_id, preferred_facility_id) OUTPUT INSERTED.id VALUES (@name, @roleId, @pfid)',
      [
        { name: 'name', type: sql.NVarChar, value: name },
        { name: 'roleId', type: sql.Int, value: roleId },
        { name: 'pfid', type: sql.Int, value: preferredFacilityId || null }
      ]
    );
    return r.recordset[0].id;
  },

  async update(id, name, roleId, preferredFacilityId) {
    await query(
      'UPDATE personnel SET name = @name, role_id = @roleId, preferred_facility_id = @pfid WHERE id = @id',
      [
        { name: 'id', type: sql.Int, value: id },
        { name: 'name', type: sql.NVarChar, value: name },
        { name: 'roleId', type: sql.Int, value: roleId },
        { name: 'pfid', type: sql.Int, value: preferredFacilityId || null }
      ]
    );
  },

  async updatePreferredFacility(id, preferredFacilityId) {
    await query(
      'UPDATE personnel SET preferred_facility_id = @pfid WHERE id = @id',
      [
        { name: 'id', type: sql.Int, value: id },
        { name: 'pfid', type: sql.Int, value: preferredFacilityId || null }
      ]
    );
  },

  async deactivate(id) {
    await query('UPDATE personnel SET is_active = 0 WHERE id = @id',
      [{ name: 'id', type: sql.Int, value: id }]);
  },

  async delete(id) {
    const p = [{ name: 'id', type: sql.Int, value: id }];
    // cascade: remove constraints and schedule assignments first
    await query('DELETE FROM constraints WHERE personnel_id = @id', p);
    await query('DELETE FROM schedule_assignments WHERE personnel_id = @id', p);
    await query('DELETE FROM personnel WHERE id = @id', p);
  }
};

// ==================== FACILITIES ====================
const Facilities = {
  async getAll() {
    const r = await query('SELECT * FROM facilities WHERE is_active = 1 ORDER BY name');
    return r.recordset;
  },

  async create(name) {
    const r = await query(
      'INSERT INTO facilities (name) OUTPUT INSERTED.id VALUES (@name)',
      [{ name: 'name', type: sql.NVarChar, value: name }]
    );
    return r.recordset[0].id;
  },

  async update(id, name) {
    await query('UPDATE facilities SET name = @name WHERE id = @id',
      [
        { name: 'id', type: sql.Int, value: id },
        { name: 'name', type: sql.NVarChar, value: name }
      ]);
  },

  async delete(id) {
    await query('UPDATE facilities SET is_active = 0 WHERE id = @id',
      [{ name: 'id', type: sql.Int, value: id }]);
  }
};

// ==================== SHIFTS ====================
const Shifts = {
  async getAll() {
    const r = await query('SELECT * FROM shifts ORDER BY order_num');
    return r.recordset;
  },

  async create(name, startTime, endTime, orderNum) {
    const r = await query(
      `INSERT INTO shifts (name, start_time, end_time, order_num)
       OUTPUT INSERTED.id
       VALUES (@name, @st, @et, @on)`,
      [
        { name: 'name', type: sql.NVarChar, value: name },
        { name: 'st', type: sql.NVarChar, value: startTime },
        { name: 'et', type: sql.NVarChar, value: endTime },
        { name: 'on', type: sql.Int, value: orderNum }
      ]
    );
    return r.recordset[0].id;
  },

  async update(id, name, startTime, endTime, orderNum) {
    await query(
      'UPDATE shifts SET name=@name, start_time=@st, end_time=@et, order_num=@on WHERE id=@id',
      [
        { name: 'id', type: sql.Int, value: id },
        { name: 'name', type: sql.NVarChar, value: name },
        { name: 'st', type: sql.NVarChar, value: startTime },
        { name: 'et', type: sql.NVarChar, value: endTime },
        { name: 'on', type: sql.Int, value: orderNum }
      ]
    );
  },

  async delete(id) {
    await query('DELETE FROM shifts WHERE id = @id',
      [{ name: 'id', type: sql.Int, value: id }]);
  },

  async getRequirements(shiftId) {
    const r = await query(
      `SELECT sr.*, r.name as role_name
       FROM shift_requirements sr
       JOIN roles r ON sr.role_id = r.id
       WHERE sr.shift_id = @shiftId`,
      [{ name: 'shiftId', type: sql.Int, value: shiftId }]
    );
    return r.recordset;
  },

  async getAllRequirements() {
    const r = await query(
      `SELECT sr.*, r.name as role_name, s.name as shift_name, f.name as facility_name
       FROM shift_requirements sr
       JOIN roles r ON sr.role_id = r.id
       JOIN shifts s ON sr.shift_id = s.id
       LEFT JOIN facilities f ON sr.facility_id = f.id
       ORDER BY CASE WHEN sr.facility_id IS NULL THEN 0 ELSE 1 END, f.name, s.order_num, r.name`
    );
    return r.recordset;
  },

  async setRequirement(shiftId, roleId, count, facilityId) {
    await query(
      `IF EXISTS (SELECT 1 FROM shift_requirements WHERE shift_id=@sid AND role_id=@rid AND ((@fid IS NULL AND facility_id IS NULL) OR facility_id=@fid))
         UPDATE shift_requirements SET count=@cnt WHERE shift_id=@sid AND role_id=@rid AND ((@fid IS NULL AND facility_id IS NULL) OR facility_id=@fid)
       ELSE
         INSERT INTO shift_requirements (shift_id, role_id, count, facility_id) VALUES (@sid, @rid, @cnt, @fid)`,
      [
        { name: 'sid', type: sql.Int, value: shiftId },
        { name: 'rid', type: sql.Int, value: roleId },
        { name: 'cnt', type: sql.Int, value: count },
        { name: 'fid', type: sql.Int, value: facilityId || null }
      ]
    );
  },

  async deleteRequirement(shiftId, roleId, facilityId) {
    await query(
      'DELETE FROM shift_requirements WHERE shift_id=@sid AND role_id=@rid AND ((@fid IS NULL AND facility_id IS NULL) OR facility_id=@fid)',
      [
        { name: 'sid', type: sql.Int, value: shiftId },
        { name: 'rid', type: sql.Int, value: roleId },
        { name: 'fid', type: sql.Int, value: facilityId || null }
      ]
    );
  }
};

// ==================== CONSTRAINTS ====================
const Constraints = {
  async getByPersonnel(personnelId) {
    const r = await query(
      `SELECT c.*, s.name as shift_name
       FROM constraints c
       LEFT JOIN shifts s ON c.shift_id = s.id
       WHERE c.personnel_id = @pid
       ORDER BY c.constraint_date`,
      [{ name: 'pid', type: sql.Int, value: personnelId }]
    );
    return r.recordset;
  },

  async getForRange(startDate, endDate) {
    const r = await query(
      `SELECT c.*, p.name as personnel_name, p.role_id,
              s.name as shift_name
       FROM constraints c
       JOIN personnel p ON c.personnel_id = p.id
       LEFT JOIN shifts s ON c.shift_id = s.id
       WHERE c.constraint_date BETWEEN @sd AND @ed
       ORDER BY c.constraint_date, p.name`,
      [
        { name: 'sd', type: sql.Date, value: new Date(startDate) },
        { name: 'ed', type: sql.Date, value: new Date(endDate) }
      ]
    );
    return r.recordset;
  },

  async add(personnelId, date, shiftId, reason) {
    // Check if already exists
    const existing = await query(
      `SELECT id FROM constraints
       WHERE personnel_id=@pid AND constraint_date=@date
       AND (shift_id=@sid OR (@sid IS NULL AND shift_id IS NULL))`,
      [
        { name: 'pid', type: sql.Int, value: personnelId },
        { name: 'date', type: sql.Date, value: new Date(date) },
        { name: 'sid', type: sql.Int, value: shiftId || null }
      ]
    );
    if (existing.recordset.length > 0) return existing.recordset[0].id;

    const r = await query(
      `INSERT INTO constraints (personnel_id, constraint_date, shift_id, reason)
       OUTPUT INSERTED.id
       VALUES (@pid, @date, @sid, @reason)`,
      [
        { name: 'pid', type: sql.Int, value: personnelId },
        { name: 'date', type: sql.Date, value: new Date(date) },
        { name: 'sid', type: sql.Int, value: shiftId || null },
        { name: 'reason', type: sql.NVarChar, value: reason || null }
      ]
    );
    return r.recordset[0].id;
  },

  async remove(id) {
    await query('DELETE FROM constraints WHERE id = @id',
      [{ name: 'id', type: sql.Int, value: id }]);
  },

  async removeByPersonnelAndDate(personnelId, date, shiftId) {
    await query(
      `DELETE FROM constraints
       WHERE personnel_id=@pid AND constraint_date=@date
       AND ((@sid IS NULL AND shift_id IS NULL) OR shift_id=@sid)`,
      [
        { name: 'pid', type: sql.Int, value: personnelId },
        { name: 'date', type: sql.Date, value: new Date(date) },
        { name: 'sid', type: sql.Int, value: shiftId || null }
      ]
    );
  }
};

// ==================== SCHEDULE ====================
const Schedule = {
  async getPeriods() {
    const r = await query(
      'SELECT * FROM schedule_periods ORDER BY start_date DESC'
    );
    return r.recordset;
  },

  async getPeriodById(id) {
    const r = await query(
      'SELECT * FROM schedule_periods WHERE id = @id',
      [{ name: 'id', type: sql.Int, value: id }]
    );
    return r.recordset[0] || null;
  },

  async createPeriod(name, startDate, endDate) {
    const r = await query(
      `INSERT INTO schedule_periods (name, start_date, end_date)
       OUTPUT INSERTED.id
       VALUES (@name, @sd, @ed)`,
      [
        { name: 'name', type: sql.NVarChar, value: name },
        { name: 'sd', type: sql.Date, value: new Date(startDate) },
        { name: 'ed', type: sql.Date, value: new Date(endDate) }
      ]
    );
    return r.recordset[0].id;
  },

  async deletePeriod(id) {
    await query('DELETE FROM schedule_periods WHERE id = @id',
      [{ name: 'id', type: sql.Int, value: id }]);
  },

  async getAssignments(periodId) {
    const r = await query(
      `SELECT sa.*,
              p.name as personnel_name,
              r.name as role_name,
              r.is_commander_eligible,
              s.name as shift_name,
              s.start_time, s.end_time, s.order_num,
              f.name as facility_name
       FROM schedule_assignments sa
       JOIN personnel p ON sa.personnel_id = p.id
       JOIN roles r ON p.role_id = r.id
       JOIN shifts s ON sa.shift_id = s.id
       JOIN facilities f ON sa.facility_id = f.id
       WHERE sa.period_id = @pid
       ORDER BY sa.assignment_date, f.name, s.order_num, r.name, p.name`,
      [{ name: 'pid', type: sql.Int, value: periodId }]
    );
    return r.recordset;
  },

  async clearAssignments(periodId) {
    await query('DELETE FROM schedule_assignments WHERE period_id = @pid',
      [{ name: 'pid', type: sql.Int, value: periodId }]);
  },

  async bulkInsertAssignments(assignments) {
    if (!assignments || assignments.length === 0) return;
    // Insert in batches of 50
    const batchSize = 50;
    const { getPool } = require('../config/db');
    const pool = await getPool();

    for (let i = 0; i < assignments.length; i += batchSize) {
      const batch = assignments.slice(i, i + batchSize);
      for (const a of batch) {
        await pool.request()
          .input('pid', sql.Int, a.period_id)
          .input('date', sql.Date, new Date(a.assignment_date))
          .input('sid', sql.Int, a.shift_id)
          .input('pers', sql.Int, a.personnel_id)
          .input('fid', sql.Int, a.facility_id)
          .input('cmd', sql.Bit, a.is_commander ? 1 : 0)
          .query(`INSERT INTO schedule_assignments
                  (period_id, assignment_date, shift_id, personnel_id, facility_id, is_commander)
                  VALUES (@pid, @date, @sid, @pers, @fid, @cmd)`);
      }
    }
  },

  async getWorkloadStats(periodId) {
    const r = await query(
      `SELECT p.id, p.name, r.name as role_name, COUNT(*) as shift_count
       FROM schedule_assignments sa
       JOIN personnel p ON sa.personnel_id = p.id
       JOIN roles r ON p.role_id = r.id
       WHERE sa.period_id = @pid
       GROUP BY p.id, p.name, r.name
       ORDER BY shift_count DESC`,
      [{ name: 'pid', type: sql.Int, value: periodId }]
    );
    return r.recordset;
  }
};

// ==================== MAX SHIFTS RULES ====================
const MaxShiftsRules = {
  async getAll() {
    const r = await query(
      `SELECT m.*, r.name as role_name, p.name as personnel_name
       FROM max_shifts_rules m
       LEFT JOIN roles r ON m.role_id = r.id
       LEFT JOIN personnel p ON m.personnel_id = p.id
       ORDER BY m.period_type, r.name, p.name`
    );
    return r.recordset;
  },

  async getForRoles() {
    const r = await query(
      `SELECT m.*, r.name as role_name
       FROM max_shifts_rules m
       LEFT JOIN roles r ON m.role_id = r.id
       WHERE m.role_id IS NOT NULL`
    );
    return r.recordset;
  },

  async create(roleId, personnelId, maxShifts, periodType) {
    const r = await query(
      `INSERT INTO max_shifts_rules (role_id, personnel_id, max_shifts, period_type)
       OUTPUT INSERTED.id
       VALUES (@rid, @pid, @ms, @pt)`,
      [
        { name: 'rid', type: sql.Int, value: roleId || null },
        { name: 'pid', type: sql.Int, value: personnelId || null },
        { name: 'ms', type: sql.Int, value: parseInt(maxShifts) },
        { name: 'pt', type: sql.NVarChar, value: periodType }
      ]
    );
    return r.recordset[0].id;
  },

  async update(id, maxShifts, periodType) {
    await query(
      'UPDATE max_shifts_rules SET max_shifts=@ms, period_type=@pt WHERE id=@id',
      [
        { name: 'id', type: sql.Int, value: id },
        { name: 'ms', type: sql.Int, value: parseInt(maxShifts) },
        { name: 'pt', type: sql.NVarChar, value: periodType }
      ]
    );
  },

  async delete(id) {
    await query('DELETE FROM max_shifts_rules WHERE id=@id',
      [{ name: 'id', type: sql.Int, value: id }]);
  },

  // Returns map: personnelId -> { maxShifts, periodType } using role-level rules
  async buildLookup() {
    const rules = await this.getAll();
    // Returns array for generator to use
    return rules;
  }
};

module.exports = { Settings, Roles, Personnel, Facilities, Shifts, Constraints, Schedule, MaxShiftsRules };

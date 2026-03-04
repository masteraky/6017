const express = require('express');
const router = express.Router();
const { Settings, Roles, Personnel, Facilities, Shifts, Constraints, Schedule, MaxShiftsRules } = require('../models/db');
const scheduleGenerator = require('../services/scheduleGenerator');

// Middleware: require admin login
function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

// ==================== LOGIN ====================
router.get('/login', (req, res) => {
  res.render('admin-login', {
    title: 'כניסת מנהל - יחידה 6017',
    error: null
  });
});

router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const adminPass = await Settings.get('admin_password') || process.env.ADMIN_PASSWORD || 'unit6017';

    if (password === adminPass) {
      req.session.isAdmin = true;
      res.redirect('/admin');
    } else {
      res.render('admin-login', {
        title: 'כניסת מנהל - יחידה 6017',
        error: 'סיסמה שגויה'
      });
    }
  } catch (err) {
    res.render('admin-login', {
      title: 'כניסת מנהל - יחידה 6017',
      error: 'שגיאה בהתחברות'
    });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ==================== DASHBOARD ====================
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [roles, personnel, facilities, shifts, requirements, periods, settings, maxShiftsRules] = await Promise.all([
      Roles.getAll(),
      Personnel.getAll(),
      Facilities.getAll(),
      Shifts.getAll(),
      Shifts.getAllRequirements(),
      Schedule.getPeriods(),
      Settings.getAll(),
      MaxShiftsRules.getAll()
    ]);

    res.render('admin', {
      title: 'לוח בקרה - יחידה 6017',
      roles,
      personnel,
      facilities,
      shifts,
      requirements,
      periods,
      settings,
      maxShiftsRules,
      success: req.query.success || null,
      error: req.query.error || null,
      tab: req.query.tab || 'dashboard'
    });
  } catch (err) {
    console.error(err);
    res.render('admin', {
      title: 'לוח בקרה - יחידה 6017',
      roles: [], personnel: [], facilities: [], shifts: [],
      requirements: [], periods: [], settings: {}, maxShiftsRules: [],
      success: null, error: err.message, tab: 'dashboard'
    });
  }
});

// ==================== ROLES ====================
router.post('/roles', requireAdmin, async (req, res) => {
  try {
    const { name, is_commander_eligible } = req.body;
    await Roles.create(name, is_commander_eligible === '1');
    res.redirect('/admin?tab=roles&success=תפקיד נוסף בהצלחה');
  } catch (err) {
    res.redirect('/admin?tab=roles&error=' + encodeURIComponent(err.message));
  }
});

router.post('/roles/:id/update', requireAdmin, async (req, res) => {
  try {
    const { name, is_commander_eligible } = req.body;
    await Roles.update(parseInt(req.params.id), name, is_commander_eligible === '1');
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/roles/:id/delete', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { personnel_action, new_role_id } = req.body;
    const count = await Roles.countPersonnel(id);

    if (count > 0) {
      if (personnel_action === 'delete') {
        // Cascade delete: remove constraints + assignments + personnel for this role
        const { getPool } = require('../config/db');
        const sql = require('mssql');
        const pool = await getPool();
        await pool.request().input('rid', sql.Int, id)
          .query('DELETE FROM constraints WHERE personnel_id IN (SELECT id FROM personnel WHERE role_id=@rid)');
        await pool.request().input('rid', sql.Int, id)
          .query('DELETE FROM schedule_assignments WHERE personnel_id IN (SELECT id FROM personnel WHERE role_id=@rid)');
        await pool.request().input('rid', sql.Int, id)
          .query('DELETE FROM personnel WHERE role_id=@rid');
      } else if (personnel_action === 'reassign' && new_role_id) {
        await Roles.reassignPersonnel(id, parseInt(new_role_id));
      } else {
        return res.redirect('/admin?tab=roles&error=' + encodeURIComponent(
          `לא ניתן למחוק — ישנם ${count} אנשי צוות המשויכים לתפקיד זה.`
        ));
      }
    }

    await Roles.delete(id);
    res.redirect('/admin?tab=roles&success=תפקיד נמחק בהצלחה');
  } catch (err) {
    res.redirect('/admin?tab=roles&error=' + encodeURIComponent(err.message));
  }
});

// ==================== PERSONNEL ====================
router.post('/personnel', requireAdmin, async (req, res) => {
  try {
    const { name, role_id, preferred_facility_id } = req.body;
    await Personnel.create(name, parseInt(role_id), preferred_facility_id ? parseInt(preferred_facility_id) : null);
    res.redirect('/admin?tab=personnel&success=איש צוות נוסף בהצלחה');
  } catch (err) {
    res.redirect('/admin?tab=personnel&error=' + encodeURIComponent(err.message));
  }
});

router.post('/personnel/:id/update', requireAdmin, async (req, res) => {
  try {
    const { name, role_id, preferred_facility_id } = req.body;
    await Personnel.update(parseInt(req.params.id), name, parseInt(role_id), preferred_facility_id ? parseInt(preferred_facility_id) : null);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/personnel/:id/delete', requireAdmin, async (req, res) => {
  try {
    await Personnel.delete(parseInt(req.params.id));
    res.redirect('/admin?tab=personnel&success=איש צוות הוסר');
  } catch (err) {
    res.redirect('/admin?tab=personnel&error=' + encodeURIComponent(err.message));
  }
});

// ==================== FACILITIES ====================
router.post('/facilities', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    await Facilities.create(name);
    res.redirect('/admin?tab=facilities&success=מתקן נוסף בהצלחה');
  } catch (err) {
    res.redirect('/admin?tab=facilities&error=' + encodeURIComponent(err.message));
  }
});

router.post('/facilities/:id/update', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    await Facilities.update(parseInt(req.params.id), name);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/facilities/:id/delete', requireAdmin, async (req, res) => {
  try {
    await Facilities.delete(parseInt(req.params.id));
    res.redirect('/admin?tab=facilities&success=מתקן הוסר');
  } catch (err) {
    res.redirect('/admin?tab=facilities&error=' + encodeURIComponent(err.message));
  }
});

// ==================== SHIFTS ====================
router.post('/shifts', requireAdmin, async (req, res) => {
  try {
    const { name, start_time, end_time, order_num } = req.body;
    await Shifts.create(name, start_time, end_time, parseInt(order_num) || 1);
    res.redirect('/admin?tab=shifts&success=משמרת נוספה בהצלחה');
  } catch (err) {
    res.redirect('/admin?tab=shifts&error=' + encodeURIComponent(err.message));
  }
});

router.post('/shifts/:id/update', requireAdmin, async (req, res) => {
  try {
    const { name, start_time, end_time, order_num } = req.body;
    await Shifts.update(parseInt(req.params.id), name, start_time, end_time, parseInt(order_num));
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/shifts/:id/delete', requireAdmin, async (req, res) => {
  try {
    await Shifts.delete(parseInt(req.params.id));
    res.redirect('/admin?tab=shifts&success=משמרת נמחקה');
  } catch (err) {
    res.redirect('/admin?tab=shifts&error=' + encodeURIComponent(err.message));
  }
});

// Shift requirements
router.post('/shifts/:id/requirements', requireAdmin, async (req, res) => {
  try {
    const shiftId = parseInt(req.params.id);
    const { role_id, count, facility_id } = req.body;
    await Shifts.setRequirement(shiftId, parseInt(role_id), parseInt(count) || 1, facility_id ? parseInt(facility_id) : null);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/shifts/:shiftId/requirements/:roleId/delete', requireAdmin, async (req, res) => {
  try {
    const facilityId = req.body && req.body.facility_id != null ? parseInt(req.body.facility_id) : null;
    await Shifts.deleteRequirement(parseInt(req.params.shiftId), parseInt(req.params.roleId), facilityId);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==================== SCHEDULE GENERATION ====================
router.post('/schedule/generate', requireAdmin, async (req, res) => {
  try {
    const { name, start_date, end_date, facility_ids } = req.body;

    if (!name || !start_date || !end_date) {
      return res.redirect('/admin?tab=schedule&error=נא למלא את כל השדות');
    }

    const facilityIdList = Array.isArray(facility_ids)
      ? facility_ids.map(Number)
      : [parseInt(facility_ids)];

    if (!facilityIdList.length || facilityIdList.some(isNaN)) {
      return res.redirect('/admin?tab=schedule&error=נא לבחור לפחות מתקן אחד');
    }

    const periodId = await Schedule.createPeriod(name, start_date, end_date);

    const assignments = await scheduleGenerator.generate(
      start_date,
      end_date,
      facilityIdList,
      periodId
    );

    await Schedule.bulkInsertAssignments(assignments);

    res.redirect(`/schedule/${periodId}`);
  } catch (err) {
    console.error(err);
    res.redirect('/admin?tab=schedule&error=' + encodeURIComponent(err.message));
  }
});

router.post('/schedule/:id/delete', requireAdmin, async (req, res) => {
  try {
    await Schedule.deletePeriod(parseInt(req.params.id));
    res.redirect('/admin?tab=schedule&success=סידור נמחק');
  } catch (err) {
    res.redirect('/admin?tab=schedule&error=' + encodeURIComponent(err.message));
  }
});

// ==================== SETTINGS ====================
router.post('/settings', requireAdmin, async (req, res) => {
  try {
    const { admin_password, app_name } = req.body;
    if (admin_password) await Settings.set('admin_password', admin_password);
    if (app_name) await Settings.set('app_name', app_name);
    res.redirect('/admin?tab=settings&success=הגדרות עודכנו בהצלחה');
  } catch (err) {
    res.redirect('/admin?tab=settings&error=' + encodeURIComponent(err.message));
  }
});

// View constraints for a period
router.get('/constraints/:startDate/:endDate', requireAdmin, async (req, res) => {
  try {
    const constraints = await Constraints.getForRange(
      req.params.startDate,
      req.params.endDate
    );
    res.json({ success: true, constraints });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;

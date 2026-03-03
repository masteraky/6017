const express = require('express');
const router = express.Router();
const { Personnel, Roles, Shifts, Constraints } = require('../models/db');

// Home - Constraints input page
router.get('/', async (req, res) => {
  try {
    const personnel = await Personnel.getAll();
    const shifts = await Shifts.getAll();
    res.render('index', {
      title: 'הגשת אילוצים - יחידה 6017',
      personnel,
      shifts,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error(err);
    res.render('index', {
      title: 'הגשת אילוצים - יחידה 6017',
      personnel: [],
      shifts: [],
      success: null,
      error: 'שגיאה בטעינת הנתונים'
    });
  }
});

// Get constraints for a specific personnel member (AJAX)
router.get('/constraints/:personnelId', async (req, res) => {
  try {
    const constraints = await Constraints.getByPersonnel(parseInt(req.params.personnelId));
    res.json({ success: true, constraints });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Save constraints (AJAX)
router.post('/constraints', async (req, res) => {
  try {
    const { personnel_id, date, shift_id, reason, action } = req.body;

    // Handle removal by constraint_id (from list)
    if (action === 'remove' && req.body.constraint_id) {
      await Constraints.remove(parseInt(req.body.constraint_id));
      return res.json({ success: true });
    }

    if (!personnel_id || !date) {
      return res.json({ success: false, error: 'חסרים פרטים' });
    }

    if (action === 'remove') {
      await Constraints.removeByPersonnelAndDate(
        parseInt(personnel_id),
        date,
        shift_id ? parseInt(shift_id) : null
      );
    } else {
      await Constraints.add(
        parseInt(personnel_id),
        date,
        shift_id ? parseInt(shift_id) : null,
        reason || null
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.message });
  }
});

// View schedule (public)
router.get('/schedule/:periodId', async (req, res) => {
  try {
    const { Schedule } = require('../models/db');
    const period = await Schedule.getPeriodById(parseInt(req.params.periodId));
    if (!period) {
      return res.redirect('/?error=סידור לא נמצא');
    }
    const assignments = await Schedule.getAssignments(parseInt(req.params.periodId));
    const stats = await Schedule.getWorkloadStats(parseInt(req.params.periodId));

    // Group assignments by date -> facility -> shift
    const grouped = {};
    assignments.forEach(a => {
      const dateStr = a.assignment_date.toISOString().split('T')[0];
      if (!grouped[dateStr]) grouped[dateStr] = {};
      if (!grouped[dateStr][a.facility_name]) grouped[dateStr][a.facility_name] = {};
      if (!grouped[dateStr][a.facility_name][a.shift_name]) {
        grouped[dateStr][a.facility_name][a.shift_name] = {
          shift_info: { start_time: a.start_time, end_time: a.end_time, order_num: a.order_num },
          people: []
        };
      }
      grouped[dateStr][a.facility_name][a.shift_name].people.push(a);
    });

    res.render('schedule', {
      title: `סידור עבודה - ${period.name}`,
      period,
      grouped,
      stats
    });
  } catch (err) {
    console.error(err);
    res.redirect('/?error=שגיאה בטעינת הסידור');
  }
});

module.exports = router;

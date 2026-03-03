-- =============================================
-- Unit 6017 Scheduler - Database Initialization
-- Each statement is separated by GO-equivalent
-- =============================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='settings' AND xtype='U')
CREATE TABLE settings (key_name NVARCHAR(100) PRIMARY KEY, key_value NVARCHAR(500) NOT NULL);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='roles' AND xtype='U')
CREATE TABLE roles (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(100) NOT NULL, is_commander_eligible BIT DEFAULT 0, created_at DATETIME DEFAULT GETDATE());

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='personnel' AND xtype='U')
CREATE TABLE personnel (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(100) NOT NULL, role_id INT NOT NULL, is_active BIT DEFAULT 1, created_at DATETIME DEFAULT GETDATE(), FOREIGN KEY (role_id) REFERENCES roles(id));

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='facilities' AND xtype='U')
CREATE TABLE facilities (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(100) NOT NULL, is_active BIT DEFAULT 1, created_at DATETIME DEFAULT GETDATE());

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='shifts' AND xtype='U')
CREATE TABLE shifts (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(100) NOT NULL, start_time NVARCHAR(10), end_time NVARCHAR(10), order_num INT DEFAULT 1, created_at DATETIME DEFAULT GETDATE());

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='shift_requirements' AND xtype='U')
CREATE TABLE shift_requirements (id INT PRIMARY KEY IDENTITY(1,1), shift_id INT NOT NULL, role_id INT NOT NULL, count INT DEFAULT 1, FOREIGN KEY (shift_id) REFERENCES shifts(id), FOREIGN KEY (role_id) REFERENCES roles(id), CONSTRAINT uq_shift_role UNIQUE (shift_id, role_id));

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='constraints' AND xtype='U')
CREATE TABLE constraints (id INT PRIMARY KEY IDENTITY(1,1), personnel_id INT NOT NULL, constraint_date DATE NOT NULL, shift_id INT NULL, reason NVARCHAR(500) NULL, created_at DATETIME DEFAULT GETDATE(), FOREIGN KEY (personnel_id) REFERENCES personnel(id), FOREIGN KEY (shift_id) REFERENCES shifts(id));

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='max_shifts_rules' AND xtype='U')
CREATE TABLE max_shifts_rules (id INT PRIMARY KEY IDENTITY(1,1), role_id INT NULL, personnel_id INT NULL, max_shifts INT NOT NULL DEFAULT 5, period_type NVARCHAR(10) NOT NULL DEFAULT 'week', created_at DATETIME DEFAULT GETDATE(), FOREIGN KEY (role_id) REFERENCES roles(id), FOREIGN KEY (personnel_id) REFERENCES personnel(id));

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='schedule_periods' AND xtype='U')
CREATE TABLE schedule_periods (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(200) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, created_at DATETIME DEFAULT GETDATE(), created_by NVARCHAR(100) DEFAULT 'admin');

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='schedule_assignments' AND xtype='U')
CREATE TABLE schedule_assignments (id INT PRIMARY KEY IDENTITY(1,1), period_id INT NOT NULL, assignment_date DATE NOT NULL, shift_id INT NOT NULL, personnel_id INT NOT NULL, facility_id INT NOT NULL, is_commander BIT DEFAULT 0, FOREIGN KEY (period_id) REFERENCES schedule_periods(id) ON DELETE CASCADE, FOREIGN KEY (shift_id) REFERENCES shifts(id), FOREIGN KEY (personnel_id) REFERENCES personnel(id), FOREIGN KEY (facility_id) REFERENCES facilities(id));

-- ===================== DEFAULT SETTINGS =====================
IF NOT EXISTS (SELECT 1 FROM settings WHERE key_name='admin_password')
INSERT INTO settings (key_name,key_value) VALUES ('admin_password','unit6017');

IF NOT EXISTS (SELECT 1 FROM settings WHERE key_name='app_name')
INSERT INTO settings (key_name,key_value) VALUES ('app_name',N'מערכת סידור עבודה - יחידה 6017');

-- ===================== DEFAULT ROLES =====================
IF NOT EXISTS (SELECT 1 FROM roles WHERE name=N'רופא שיניים')
INSERT INTO roles (name,is_commander_eligible) VALUES (N'רופא שיניים',0);

IF NOT EXISTS (SELECT 1 FROM roles WHERE name=N'רופא משפטי')
INSERT INTO roles (name,is_commander_eligible) VALUES (N'רופא משפטי',0);

IF NOT EXISTS (SELECT 1 FROM roles WHERE name=N'צלם')
INSERT INTO roles (name,is_commander_eligible) VALUES (N'צלם',0);

IF NOT EXISTS (SELECT 1 FROM roles WHERE name=N'קצין רפואה')
INSERT INTO roles (name,is_commander_eligible) VALUES (N'קצין רפואה',1);

IF NOT EXISTS (SELECT 1 FROM roles WHERE name=N'פרמדיק')
INSERT INTO roles (name,is_commander_eligible) VALUES (N'פרמדיק',0);

IF NOT EXISTS (SELECT 1 FROM roles WHERE name=N'אחות/אח')
INSERT INTO roles (name,is_commander_eligible) VALUES (N'אחות/אח',0);

IF NOT EXISTS (SELECT 1 FROM roles WHERE name=N'מנהל רפואי')
INSERT INTO roles (name,is_commander_eligible) VALUES (N'מנהל רפואי',1);

IF NOT EXISTS (SELECT 1 FROM roles WHERE name=N'טכנאי מעבדה')
INSERT INTO roles (name,is_commander_eligible) VALUES (N'טכנאי מעבדה',0);

-- ===================== DEFAULT SHIFTS =====================
IF NOT EXISTS (SELECT 1 FROM shifts WHERE name=N'משמרת בוקר')
INSERT INTO shifts (name,start_time,end_time,order_num) VALUES (N'משמרת בוקר','07:00','15:00',1);

IF NOT EXISTS (SELECT 1 FROM shifts WHERE name=N'משמרת צהריים')
INSERT INTO shifts (name,start_time,end_time,order_num) VALUES (N'משמרת צהריים','15:00','23:00',2);

IF NOT EXISTS (SELECT 1 FROM shifts WHERE name=N'משמרת לילה')
INSERT INTO shifts (name,start_time,end_time,order_num) VALUES (N'משמרת לילה','23:00','07:00',3);

-- ===================== DEFAULT FACILITIES =====================
IF NOT EXISTS (SELECT 1 FROM facilities WHERE name=N'מתקן א׳ - מרכז')
INSERT INTO facilities (name,is_active) VALUES (N'מתקן א׳ - מרכז',1);

IF NOT EXISTS (SELECT 1 FROM facilities WHERE name=N'מתקן ב׳ - צפון')
INSERT INTO facilities (name,is_active) VALUES (N'מתקן ב׳ - צפון',1);

-- ===================== DEMO PERSONNEL =====================
IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'סרן יעל כהן')
INSERT INTO personnel (name,role_id) SELECT N'סרן יעל כהן',id FROM roles WHERE name=N'קצין רפואה';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'סגן אלון לוי')
INSERT INTO personnel (name,role_id) SELECT N'סגן אלון לוי',id FROM roles WHERE name=N'קצין רפואה';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'רב-סרן מירב בן-דוד')
INSERT INTO personnel (name,role_id) SELECT N'רב-סרן מירב בן-דוד',id FROM roles WHERE name=N'מנהל רפואי';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'סרן גיל אברהם')
INSERT INTO personnel (name,role_id) SELECT N'סרן גיל אברהם',id FROM roles WHERE name=N'מנהל רפואי';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'ד"ר נועם שפירא')
INSERT INTO personnel (name,role_id) SELECT N'ד"ר נועם שפירא',id FROM roles WHERE name=N'רופא שיניים';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'ד"ר תמר רוזנברג')
INSERT INTO personnel (name,role_id) SELECT N'ד"ר תמר רוזנברג',id FROM roles WHERE name=N'רופא שיניים';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'ד"ר עמית גולן')
INSERT INTO personnel (name,role_id) SELECT N'ד"ר עמית גולן',id FROM roles WHERE name=N'רופא שיניים';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'ד"ר שירה מנחם')
INSERT INTO personnel (name,role_id) SELECT N'ד"ר שירה מנחם',id FROM roles WHERE name=N'רופא שיניים';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'ד"ר אורן פרידמן')
INSERT INTO personnel (name,role_id) SELECT N'ד"ר אורן פרידמן',id FROM roles WHERE name=N'רופא משפטי';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'ד"ר רחל זיו')
INSERT INTO personnel (name,role_id) SELECT N'ד"ר רחל זיו',id FROM roles WHERE name=N'רופא משפטי';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'ד"ר דניאל כץ')
INSERT INTO personnel (name,role_id) SELECT N'ד"ר דניאל כץ',id FROM roles WHERE name=N'רופא משפטי';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'סמל יוסי גבאי')
INSERT INTO personnel (name,role_id) SELECT N'סמל יוסי גבאי',id FROM roles WHERE name=N'פרמדיק';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'סמל ראשון רינת אזרד')
INSERT INTO personnel (name,role_id) SELECT N'סמל ראשון רינת אזרד',id FROM roles WHERE name=N'פרמדיק';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'סמל אביב מזרחי')
INSERT INTO personnel (name,role_id) SELECT N'סמל אביב מזרחי',id FROM roles WHERE name=N'פרמדיק';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'סמל חן ביטון')
INSERT INTO personnel (name,role_id) SELECT N'סמל חן ביטון',id FROM roles WHERE name=N'פרמדיק';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'סמל ליאת שם-טוב')
INSERT INTO personnel (name,role_id) SELECT N'סמל ליאת שם-טוב',id FROM roles WHERE name=N'פרמדיק';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'סמל ראשון נעמה כהן')
INSERT INTO personnel (name,role_id) SELECT N'סמל ראשון נעמה כהן',id FROM roles WHERE name=N'אחות/אח';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'סמל דויד פרץ')
INSERT INTO personnel (name,role_id) SELECT N'סמל דויד פרץ',id FROM roles WHERE name=N'אחות/אח';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'סמל מיכל שרון')
INSERT INTO personnel (name,role_id) SELECT N'סמל מיכל שרון',id FROM roles WHERE name=N'אחות/אח';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'סמל ראשון איתמר לוי')
INSERT INTO personnel (name,role_id) SELECT N'סמל ראשון איתמר לוי',id FROM roles WHERE name=N'אחות/אח';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'טוראי מור ברק')
INSERT INTO personnel (name,role_id) SELECT N'טוראי מור ברק',id FROM roles WHERE name=N'צלם';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'טוראי ניר עמרני')
INSERT INTO personnel (name,role_id) SELECT N'טוראי ניר עמרני',id FROM roles WHERE name=N'צלם';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'טוראי ראשון שני אלון')
INSERT INTO personnel (name,role_id) SELECT N'טוראי ראשון שני אלון',id FROM roles WHERE name=N'טכנאי מעבדה';

IF NOT EXISTS (SELECT 1 FROM personnel WHERE name=N'טוראי ראשון כרמל ביתן')
INSERT INTO personnel (name,role_id) SELECT N'טוראי ראשון כרמל ביתן',id FROM roles WHERE name=N'טכנאי מעבדה';

-- ===================== SHIFT REQUIREMENTS =====================
INSERT INTO shift_requirements (shift_id,role_id,count) SELECT s.id,r.id,1 FROM shifts s,roles r WHERE s.name=N'משמרת בוקר' AND r.name=N'קצין רפואה' AND NOT EXISTS (SELECT 1 FROM shift_requirements sr WHERE sr.shift_id=s.id AND sr.role_id=r.id);

INSERT INTO shift_requirements (shift_id,role_id,count) SELECT s.id,r.id,1 FROM shifts s,roles r WHERE s.name=N'משמרת בוקר' AND r.name=N'רופא שיניים' AND NOT EXISTS (SELECT 1 FROM shift_requirements sr WHERE sr.shift_id=s.id AND sr.role_id=r.id);

INSERT INTO shift_requirements (shift_id,role_id,count) SELECT s.id,r.id,2 FROM shifts s,roles r WHERE s.name=N'משמרת בוקר' AND r.name=N'פרמדיק' AND NOT EXISTS (SELECT 1 FROM shift_requirements sr WHERE sr.shift_id=s.id AND sr.role_id=r.id);

INSERT INTO shift_requirements (shift_id,role_id,count) SELECT s.id,r.id,1 FROM shifts s,roles r WHERE s.name=N'משמרת בוקר' AND r.name=N'אחות/אח' AND NOT EXISTS (SELECT 1 FROM shift_requirements sr WHERE sr.shift_id=s.id AND sr.role_id=r.id);

INSERT INTO shift_requirements (shift_id,role_id,count) SELECT s.id,r.id,1 FROM shifts s,roles r WHERE s.name=N'משמרת צהריים' AND r.name=N'קצין רפואה' AND NOT EXISTS (SELECT 1 FROM shift_requirements sr WHERE sr.shift_id=s.id AND sr.role_id=r.id);

INSERT INTO shift_requirements (shift_id,role_id,count) SELECT s.id,r.id,2 FROM shifts s,roles r WHERE s.name=N'משמרת צהריים' AND r.name=N'פרמדיק' AND NOT EXISTS (SELECT 1 FROM shift_requirements sr WHERE sr.shift_id=s.id AND sr.role_id=r.id);

INSERT INTO shift_requirements (shift_id,role_id,count) SELECT s.id,r.id,1 FROM shifts s,roles r WHERE s.name=N'משמרת צהריים' AND r.name=N'אחות/אח' AND NOT EXISTS (SELECT 1 FROM shift_requirements sr WHERE sr.shift_id=s.id AND sr.role_id=r.id);

INSERT INTO shift_requirements (shift_id,role_id,count) SELECT s.id,r.id,1 FROM shifts s,roles r WHERE s.name=N'משמרת לילה' AND r.name=N'קצין רפואה' AND NOT EXISTS (SELECT 1 FROM shift_requirements sr WHERE sr.shift_id=s.id AND sr.role_id=r.id);

INSERT INTO shift_requirements (shift_id,role_id,count) SELECT s.id,r.id,1 FROM shifts s,roles r WHERE s.name=N'משמרת לילה' AND r.name=N'פרמדיק' AND NOT EXISTS (SELECT 1 FROM shift_requirements sr WHERE sr.shift_id=s.id AND sr.role_id=r.id);

INSERT INTO shift_requirements (shift_id,role_id,count) SELECT s.id,r.id,1 FROM shifts s,roles r WHERE s.name=N'משמרת לילה' AND r.name=N'אחות/אח' AND NOT EXISTS (SELECT 1 FROM shift_requirements sr WHERE sr.shift_id=s.id AND sr.role_id=r.id);

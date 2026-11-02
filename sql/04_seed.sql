-- =====================================================================
-- CivicPulse  -  File 04 : Seed data (DML: INSERT / UPDATE / CALL)
-- Every seeded account uses the password:  Password@123
-- Complaint embeddings are filled in afterwards by
--   npm run db:embed   (scripts/backfill-embeddings.mjs)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Wards (Bengaluru)
-- ---------------------------------------------------------------------
INSERT INTO wards (name, city, pincode) VALUES
    ('Koramangala',   'Bengaluru', '560034'),
    ('Indiranagar',   'Bengaluru', '560038'),
    ('Jayanagar',     'Bengaluru', '560041'),
    ('Whitefield',    'Bengaluru', '560066'),
    ('Malleshwaram',  'Bengaluru', '560003'),
    ('Banashankari',  'Bengaluru', '560070'),
    ('HSR Layout',    'Bengaluru', '560102'),
    ('Rajajinagar',   'Bengaluru', '560010');

-- ---------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------
INSERT INTO departments (name, description) VALUES
    ('Roads and Infrastructure',  'Potholes, road surfaces, footpaths and pavements'),
    ('Solid Waste Management',    'Garbage collection, black spots and debris clearance'),
    ('Street Lighting',           'Street lights and electrical poles on public roads'),
    ('Water Supply and Drainage', 'Drains, manholes, water leaks and flooding'),
    ('Parks and Urban Forestry',  'Fallen trees, dangerous branches and public parks'),
    ('Traffic Engineering',       'Traffic signals, road signs and lane markings');

-- ---------------------------------------------------------------------
-- Categories (each belongs to one department, with a default SLA)
-- ---------------------------------------------------------------------
INSERT INTO categories (name, default_sla_hours, dept_id)
SELECT v.name, v.sla, d.dept_id
FROM (VALUES
    ('Pothole',                       48, 'Roads and Infrastructure'),
    ('Damaged road surface',          96, 'Roads and Infrastructure'),
    ('Broken footpath or pavement',   96, 'Roads and Infrastructure'),
    ('Footpath encroachment',        120, 'Roads and Infrastructure'),
    ('Garbage overflow',              24, 'Solid Waste Management'),
    ('Construction debris dumped',    72, 'Solid Waste Management'),
    ('Street light not working',      48, 'Street Lighting'),
    ('Exposed electrical wires',       6, 'Street Lighting'),
    ('Blocked drain',                 36, 'Water Supply and Drainage'),
    ('Open manhole',                   6, 'Water Supply and Drainage'),
    ('Water pipeline leak',           24, 'Water Supply and Drainage'),
    ('Fallen tree or branch',         12, 'Parks and Urban Forestry'),
    ('Traffic signal not working',    12, 'Traffic Engineering'),
    ('Missing or damaged road sign',  72, 'Traffic Engineering')
) AS v(name, sla, dept)
JOIN departments d ON d.name = v.dept;

-- ---------------------------------------------------------------------
-- Users  (password hashes created with pgcrypto bcrypt: crypt + gen_salt('bf'))
-- ---------------------------------------------------------------------
INSERT INTO users (name, email, password_hash, role, ward_id, created_at)
SELECT v.name, v.email, crypt('Password@123', gen_salt('bf', 10)), v.role, w.ward_id,
       now() - (v.days_ago || ' days')::INTERVAL
FROM (VALUES
    ('City Admin',       'admin@civicpulse.in',         'ADMIN',   'Malleshwaram', 60),
    ('Ravi Kumar',       'ravi.kumar@civicpulse.in',    'STAFF',   'Koramangala',  55),
    ('Meena Shetty',     'meena.shetty@civicpulse.in',  'STAFF',   'Jayanagar',    55),
    ('Farhan Ali',       'farhan.ali@civicpulse.in',    'STAFF',   'Indiranagar',  50),
    ('Suresh Gowda',     'suresh.gowda@civicpulse.in',  'STAFF',   'Rajajinagar',  50),
    ('Lakshmi Rao',      'lakshmi.rao@civicpulse.in',   'STAFF',   'Banashankari', 48),
    ('Prakash Hegde',    'prakash.hegde@civicpulse.in', 'STAFF',   'Whitefield',   45),
    ('Divya Nair',       'divya.nair@civicpulse.in',    'STAFF',   'HSR Layout',   45),
    ('Priya Sharma',     'priya@example.com',           'CITIZEN', 'Koramangala',  30),
    ('Rahul Menon',      'rahul@example.com',           'CITIZEN', 'Indiranagar',  28),
    ('Kavya Reddy',      'kavya@example.com',           'CITIZEN', 'Jayanagar',    25),
    ('Arjun Patil',      'arjun@example.com',           'CITIZEN', 'Whitefield',   20)
) AS v(name, email, role, ward, days_ago)
JOIN wards w ON w.name = v.ward;

-- Multivalued phone numbers
INSERT INTO user_phone (user_id, phone)
SELECT u.user_id, v.phone
FROM (VALUES
    ('admin@civicpulse.in',         '9845000001'),
    ('ravi.kumar@civicpulse.in',    '9845000002'),
    ('meena.shetty@civicpulse.in',  '9845000003'),
    ('farhan.ali@civicpulse.in',    '9845000004'),
    ('suresh.gowda@civicpulse.in',  '9845000005'),
    ('lakshmi.rao@civicpulse.in',   '9845000006'),
    ('prakash.hegde@civicpulse.in', '9845000007'),
    ('divya.nair@civicpulse.in',    '9845000008'),
    ('priya@example.com',           '9900112233'),
    ('priya@example.com',           '8050112233'),
    ('rahul@example.com',           '9900445566'),
    ('kavya@example.com',           '7019778899'),
    ('arjun@example.com',           '6360123456'),
    ('arjun@example.com',           '9480123456')
) AS v(email, phone)
JOIN users u ON u.email = v.email;

-- Staff profiles (each staff works in one department)
INSERT INTO staff_profile (staff_id, designation, is_available, dept_id)
SELECT u.user_id, v.designation, v.available, d.dept_id
FROM (VALUES
    ('ravi.kumar@civicpulse.in',    'Assistant Engineer',     TRUE,  'Roads and Infrastructure'),
    ('meena.shetty@civicpulse.in',  'Junior Engineer',        TRUE,  'Roads and Infrastructure'),
    ('farhan.ali@civicpulse.in',    'Health Inspector',       TRUE,  'Solid Waste Management'),
    ('suresh.gowda@civicpulse.in',  'Electrical Supervisor',  TRUE,  'Street Lighting'),
    ('lakshmi.rao@civicpulse.in',   'Assistant Engineer',     TRUE,  'Water Supply and Drainage'),
    ('prakash.hegde@civicpulse.in', 'Range Forest Officer',   TRUE,  'Parks and Urban Forestry'),
    ('divya.nair@civicpulse.in',    'Traffic Engineer',       FALSE, 'Traffic Engineering')
) AS v(email, designation, available, dept)
JOIN users u       ON u.email = v.email
JOIN departments d ON d.name = v.dept;

-- ---------------------------------------------------------------------
-- Complaints (all start OPEN; the trigger writes the first history row)
-- ---------------------------------------------------------------------
INSERT INTO complaints (title, description, priority, location_text, latitude, longitude,
                        created_at, citizen_id, category_id, ward_id)
SELECT v.title, v.descr, v.priority, v.loc, v.lat, v.lng,
       now() - (v.hours_ago || ' hours')::INTERVAL,
       u.user_id, cat.category_id, w.ward_id
FROM (VALUES
    ('Deep pothole at Sony World junction',
     'A large and deep pothole has formed in the middle of the left lane near the Sony World signal. Two-wheelers are swerving suddenly to avoid it and it fills with water when it rains.',
     'HIGH', '80 Feet Road, near Sony World junction', 12.936500, 77.626800, 130,
     'priya@example.com', 'Pothole', 'Koramangala'),

    ('Series of potholes on 100 Feet Road',
     'There are at least five potholes in a row on 100 Feet Road near the metro pillar 52. Cars brake hard here and there was a minor bike accident yesterday.',
     'HIGH', '100 Feet Road, near metro pillar 52', 12.971900, 77.641100, 70,
     'rahul@example.com', 'Pothole', 'Indiranagar'),

    ('Road surface completely worn out on 11th Main',
     'The tar on 11th Main has worn away and the road is now loose gravel and mud. Dust is terrible in the day and the stretch is slippery at night.',
     'MEDIUM', '11th Main Road, 4th Block', 12.925000, 77.583800, 200,
     'kavya@example.com', 'Damaged road surface', 'Jayanagar'),

    ('Broken footpath slabs near bus stop',
     'Several footpath slabs are broken and tilted near the bus stop. Elderly people and children are forced to walk on the main road because the pavement is unusable.',
     'MEDIUM', 'ITPL Main Road, Hope Farm bus stop', 12.984500, 77.750000, 160,
     'arjun@example.com', 'Broken footpath or pavement', 'Whitefield'),

    ('Footpath blocked by shop extensions',
     'Shops have extended their counters and stacked goods across the entire footpath on Sampige Road. Pedestrians have to walk on the road next to buses.',
     'LOW', 'Sampige Road, near 8th Cross', 13.003500, 77.570500, 90,
     'kavya@example.com', 'Footpath encroachment', 'Malleshwaram'),

    ('Garbage pile overflowing near park gate',
     'Garbage has not been collected for four days at the corner near the park gate. It is overflowing onto the road, smells very bad and stray dogs are spreading it around.',
     'HIGH', '5th Cross, near BDA park gate', 12.911600, 77.638900, 40,
     'priya@example.com', 'Garbage overflow', 'HSR Layout'),

    ('Construction debris dumped on service road',
     'Truckloads of construction debris and broken concrete have been dumped on the service road, blocking half of it.',
     'MEDIUM', 'Outer Ring Road service road, near Marathahalli bridge', 12.956700, 77.701100, 30,
     'arjun@example.com', 'Construction debris dumped', 'Whitefield'),

    ('Street lights off on entire stretch',
     'All street lights on the stretch from the temple to the main road have been off for a week. The area is completely dark at night and feels unsafe for women walking home.',
     'HIGH', '2nd Main Road, near Ganesha temple', 12.989000, 77.554000, 100,
     'rahul@example.com', 'Street light not working', 'Rajajinagar'),

    ('Exposed live wires on electric pole',
     'Wires are hanging loose and exposed from the junction box of the electric pole outside the school. Children touch the pole while waiting for the school bus.',
     'CRITICAL', 'Outside Vidya Mandir school, 3rd Cross', 12.925600, 77.546800, 3,
     'kavya@example.com', 'Exposed electrical wires', 'Banashankari'),

    ('Drain blocked and water stagnating',
     'The roadside drain is completely blocked with plastic and silt. After every rain the water stagnates on the road for days and mosquitoes are breeding.',
     'MEDIUM', '1st Main Road, near Forum mall back gate', 12.934000, 77.611000, 60,
     'priya@example.com', 'Blocked drain', 'Koramangala'),

    ('Open manhole without cover on main road',
     'A manhole on the main road has no cover and is just surrounded by a few stones. It is very dangerous at night for bikes and pedestrians.',
     'CRITICAL', 'CMH Road, opposite metro station exit', 12.978400, 77.638500, 20,
     'rahul@example.com', 'Open manhole', 'Indiranagar'),

    ('Drinking water pipeline leaking for days',
     'Clean drinking water is gushing out of a broken pipeline joint on the corner and flowing into the drain. Lots of water is being wasted every day.',
     'HIGH', '9th Block corner, near the water tank', 12.930800, 77.580300, 50,
     'kavya@example.com', 'Water pipeline leak', 'Jayanagar'),

    ('Large tree branch fallen across road',
     'A big branch of the rain tree fell during last night''s storm and is blocking one lane completely. Vehicles are taking the wrong side to pass.',
     'HIGH', '15th Cross, Margosa Road', 13.006000, 77.566000, 10,
     'kavya@example.com', 'Fallen tree or branch', 'Malleshwaram'),

    ('Traffic signal stuck on red',
     'The traffic signal at the junction has been stuck on red in all directions since morning, causing a huge jam. People are jumping the signal randomly.',
     'HIGH', 'Silk Board side junction, 27th Main', 12.912100, 77.644800, 8,
     'priya@example.com', 'Traffic signal not working', 'HSR Layout'),

    ('Potholes after pipeline digging not repaired',
     'The road was dug up for laying pipelines two weeks ago and only loosely filled with mud. Now it has become a row of deep potholes along the whole lane.',
     'MEDIUM', '6th Main Road, 3rd Block', 12.986700, 77.556200, 150,
     'rahul@example.com', 'Pothole', 'Rajajinagar'),

    ('Pavement tiles missing outside metro station',
     'Many interlocking pavement tiles are missing outside the metro station exit and there are deep gaps. People keep tripping, especially during peak hours.',
     'MEDIUM', 'Banashankari metro station, exit B', 12.915700, 77.573600, 26,
     'kavya@example.com', 'Broken footpath or pavement', 'Banashankari'),

    ('Pothole near school entrance',
     'There is a deep pothole right at the school entrance where parents drop children. A child on a scooter fell last week.',
     'HIGH', 'Outer Ring Road, near Delhi Public School gate', 12.960000, 77.747000, 18,
     'arjun@example.com', 'Pothole', 'Whitefield'),

    ('Stop sign knocked down at junction',
     'The stop sign at the four-way junction was knocked down by a truck and is lying on the footpath. Vehicles from the side road no longer stop.',
     'LOW', '17th Cross and 9th Main junction', 12.913000, 77.635000, 110,
     'priya@example.com', 'Missing or damaged road sign', 'HSR Layout')
) AS v(title, descr, priority, loc, lat, lng, hours_ago, email, category, ward)
JOIN users u        ON u.email = v.email
JOIN categories cat ON cat.name = v.category
JOIN wards w        ON w.name = v.ward;

-- ---------------------------------------------------------------------
-- Move seeded complaints through the workflow using the stored procedure
-- and plain UPDATEs, exactly as the application does.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE seed_progress(p_title TEXT, p_staff_email TEXT, p_target TEXT, p_note TEXT DEFAULT NULL)
LANGUAGE plpgsql
AS $$
DECLARE
    v_id    INT;
    v_staff INT;
BEGIN
    SELECT complaint_id INTO v_id FROM complaints WHERE title = p_title;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'Seed complaint "%" not found', p_title;
    END IF;

    IF p_target = 'REJECTED' THEN
        PERFORM set_config('civicpulse.status_note', COALESCE(p_note, 'Rejected by admin'), true);
        UPDATE complaints SET status = 'REJECTED' WHERE complaint_id = v_id;
        PERFORM set_config('civicpulse.status_note', '', true);
        RETURN;
    END IF;

    SELECT user_id INTO v_staff FROM users WHERE email = p_staff_email;
    CALL assign_complaint(v_id, v_staff, NULL);

    IF p_target IN ('IN_PROGRESS', 'RESOLVED') THEN
        PERFORM set_config('civicpulse.status_note', 'Inspected the site and started work', true);
        UPDATE complaints SET status = 'IN_PROGRESS' WHERE complaint_id = v_id;
    END IF;

    IF p_target = 'RESOLVED' THEN
        PERFORM set_config('civicpulse.status_note', COALESCE(p_note, 'Work completed'), true);
        UPDATE complaints SET status = 'RESOLVED' WHERE complaint_id = v_id;
    END IF;

    PERFORM set_config('civicpulse.status_note', '', true);
END;
$$;

CALL seed_progress('Deep pothole at Sony World junction',            'ravi.kumar@civicpulse.in',   'RESOLVED', 'Pothole filled with hot-mix asphalt and compacted');
CALL seed_progress('Road surface completely worn out on 11th Main',  'meena.shetty@civicpulse.in', 'RESOLVED', 'Stretch resurfaced with fresh tar');
CALL seed_progress('Broken footpath slabs near bus stop',            'meena.shetty@civicpulse.in', 'RESOLVED', 'Broken slabs replaced and levelled');
CALL seed_progress('Street lights off on entire stretch',            'suresh.gowda@civicpulse.in', 'RESOLVED', 'Faulty timer and two fused lamps replaced');
CALL seed_progress('Potholes after pipeline digging not repaired',   'ravi.kumar@civicpulse.in',   'RESOLVED', 'Trench properly back-filled and patched');
CALL seed_progress('Series of potholes on 100 Feet Road',            'ravi.kumar@civicpulse.in',   'IN_PROGRESS');
CALL seed_progress('Drain blocked and water stagnating',             'lakshmi.rao@civicpulse.in',  'IN_PROGRESS');
CALL seed_progress('Drinking water pipeline leaking for days',       'lakshmi.rao@civicpulse.in',  'RESOLVED', 'Pipeline joint replaced, supply restored');
CALL seed_progress('Garbage pile overflowing near park gate',        'farhan.ali@civicpulse.in',   'ASSIGNED');
CALL seed_progress('Open manhole without cover on main road',        'lakshmi.rao@civicpulse.in',  'ASSIGNED');
CALL seed_progress('Large tree branch fallen across road',           'prakash.hegde@civicpulse.in','IN_PROGRESS');
CALL seed_progress('Footpath blocked by shop extensions',            NULL,                         'REJECTED', 'Duplicate of an existing enforcement drive; forwarded to ward office');

DROP PROCEDURE seed_progress(TEXT, TEXT, TEXT, TEXT);

-- ---------------------------------------------------------------------
-- Spread the workflow timestamps realistically between created_at and now
-- (seeding runs in one instant, so history would otherwise all be "now").
-- ---------------------------------------------------------------------
WITH ranked AS (
    SELECT h.history_id,
           c.created_at,
           ROW_NUMBER() OVER (PARTITION BY h.complaint_id ORDER BY h.history_id) - 1 AS step,
           COUNT(*)     OVER (PARTITION BY h.complaint_id)                          AS steps
      FROM status_history h
      JOIN complaints c ON c.complaint_id = h.complaint_id
)
UPDATE status_history h
   SET changed_at = r.created_at + (now() - r.created_at) * (0.85 * r.step::DOUBLE PRECISION / r.steps)
  FROM ranked r
 WHERE r.history_id = h.history_id;

UPDATE assignments a
   SET assigned_at = h.changed_at
  FROM status_history h
 WHERE h.complaint_id = a.complaint_id
   AND h.new_status = 'ASSIGNED'
   AND a.unassigned_at IS NULL;

UPDATE complaints c
   SET resolved_at = h.changed_at
  FROM status_history h
 WHERE h.complaint_id = c.complaint_id
   AND h.new_status = 'RESOLVED'
   AND c.status = 'RESOLVED';

-- ---------------------------------------------------------------------
-- Feedback (the trigger automatically CLOSES these complaints)
-- ---------------------------------------------------------------------
INSERT INTO feedback (complaint_id, user_id, rating, comment)
SELECT c.complaint_id, c.citizen_id, v.rating, v.comment
FROM (VALUES
    ('Deep pothole at Sony World junction',           5, 'Fixed quickly and the patch is smooth. Thank you!'),
    ('Road surface completely worn out on 11th Main', 3, 'Done, but it took longer than promised.'),
    ('Street lights off on entire stretch',           4, 'Lights are working again, much safer now.')
) AS v(title, rating, comment)
JOIN complaints c ON c.title = v.title;

-- Feedback rows were stamped "now"; align them with the closing time
UPDATE feedback f
   SET created_at = h.changed_at
  FROM status_history h
 WHERE h.complaint_id = f.complaint_id
   AND h.new_status = 'CLOSED';

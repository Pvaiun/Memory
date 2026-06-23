-- Optional demo data so the board has something to surface on first run.
-- Dates are written relative-ish to a fixed base; adjust freely, or just use
-- the app. Load with:
--   wrangler d1 execute memory --local --file=./seed.sql

-- A project with a near event (should rise toward Hero).
INSERT INTO spaces (id,title,type,lifecycle,pin_weight,summary,unread,created_at,updated_at,accessed_at)
VALUES ('sp_move','Big Move','project','pinned',1,
  'Movers booked • Change address by Fri • Pack kitchen', 1,
  strftime('%s','now')*1000, strftime('%s','now')*1000, strftime('%s','now')*1000);

INSERT INTO blocks (id,space_id,type,content,completed,due_date,event_date,sort_order,created_at,updated_at)
VALUES
 ('bl_move1','sp_move','date','{"title":"Moving day"}',NULL,NULL,
   (strftime('%s','now')+86400*3)*1000,0, strftime('%s','now')*1000, strftime('%s','now')*1000),
 ('bl_move2','sp_move','task','{"text":"Change address with bank"}',0,
   (strftime('%s','now')+86400*2)*1000,NULL,1, strftime('%s','now')*1000, strftime('%s','now')*1000);

-- A person reference (permanent info — stays dormant, never escalates).
INSERT INTO spaces (id,title,type,lifecycle,pin_weight,summary,unread,created_at,updated_at,accessed_at)
VALUES ('sp_sarah','Sarah','person','active',0,'Allergic to shellfish • Birthday Mar 4',0,
  (strftime('%s','now')-86400*40)*1000, (strftime('%s','now')-86400*40)*1000, (strftime('%s','now')-86400*40)*1000);

INSERT INTO blocks (id,space_id,type,content,completed,due_date,event_date,sort_order,created_at,updated_at)
VALUES ('bl_sarah1','sp_sarah','fact','{"key":"Allergy","value":"shellfish"}',NULL,NULL,NULL,0,
  (strftime('%s','now')-86400*40)*1000, (strftime('%s','now')-86400*40)*1000);

-- A standalone task aging without a due date (escalates with age).
INSERT INTO spaces (id,title,type,lifecycle,pin_weight,summary,unread,created_at,updated_at,accessed_at)
VALUES ('sp_dentist','Book the dentist','standalone','active',0,'Book a checkup',1,
  (strftime('%s','now')-86400*9)*1000, (strftime('%s','now')-86400*9)*1000, (strftime('%s','now')-86400*9)*1000);

INSERT INTO blocks (id,space_id,type,content,completed,due_date,event_date,sort_order,created_at,updated_at)
VALUES ('bl_dentist1','sp_dentist','task','{"text":"Call and book a checkup"}',0,NULL,NULL,0,
  (strftime('%s','now')-86400*9)*1000, (strftime('%s','now')-86400*9)*1000);

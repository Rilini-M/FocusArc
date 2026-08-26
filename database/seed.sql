-- FocusArc — Study Quest System
-- Seed data: characters and their motivational quotes only.
-- No fake users, quests, or study sessions are seeded — all user data must be real.

USE focusarc;

INSERT INTO characters (name, description, image_path) VALUES
  ('Tanjiro',       'Determined and compassionate. Never gives up, no matter how hard the path.', '/assets/characters/tanjiro.jpg'),
  ('L',             'Analytical and relentless in pursuit of the truth.',                          '/assets/characters/l.jpg'),
  ('Sung Jin-Woo',  'Focused and self-disciplined. Grows stronger through consistent effort.',      '/assets/characters/sung.jpg'),
  ('Gilgamesh',     'Strategic and supremely confident in his own capability.',                     '/assets/characters/gilgamesh.jpg'),
  ('Alucard',       'Relentless and unshakably composed under pressure.',                           '/assets/characters/alucard.jpg')
ON DUPLICATE KEY UPDATE description = VALUES(description), image_path = VALUES(image_path);

INSERT INTO quotes (character_id, quote_text)
SELECT id, q.quote_text FROM characters
JOIN (
  SELECT 'Tanjiro' AS name, 'Set your heart ablaze. Focus only on what you can do right now.' AS quote_text
  UNION ALL SELECT 'Tanjiro', 'No matter how many scars it leaves, keep moving forward.'
  UNION ALL SELECT 'Tanjiro', 'Discipline today, legacy tomorrow.'
  UNION ALL SELECT 'Tanjiro', 'One quest at a time. Keep moving forward.'
  UNION ALL SELECT 'L',       'The only victory that matters is the one over yourself.'
  UNION ALL SELECT 'L',       'Whatever you decide to do, give it everything you have.'
  UNION ALL SELECT 'L',       'A calm mind solves what a rushed one never will.'
  UNION ALL SELECT 'L',       'Small, deliberate steps outperform sudden bursts of effort.'
  UNION ALL SELECT 'Sung Jin-Woo', 'I have to get stronger. One study session at a time.'
  UNION ALL SELECT 'Sung Jin-Woo', 'Consistency is the real power-up.'
  UNION ALL SELECT 'Sung Jin-Woo', 'Every rank starts at zero. Keep climbing.'
  UNION ALL SELECT 'Sung Jin-Woo', 'The grind you put in today is the strength you have tomorrow.'
  UNION ALL SELECT 'Gilgamesh',    'A king does not fear a challenge — he masters it.'
  UNION ALL SELECT 'Gilgamesh',    'Command your time, or it will command you.'
  UNION ALL SELECT 'Gilgamesh',    'Mediocrity is the only true enemy.'
  UNION ALL SELECT 'Gilgamesh',    'Treasure your focus above all else.'
  UNION ALL SELECT 'Alucard',      'Fear is only for those who have not committed fully.'
  UNION ALL SELECT 'Alucard',      'Relentless effort bends even the hardest task.'
  UNION ALL SELECT 'Alucard',      'Push through the night; the work will still be there at dawn.'
  UNION ALL SELECT 'Alucard',      'Discipline is the sharpest weapon you own.'
) AS q ON q.name = characters.name;

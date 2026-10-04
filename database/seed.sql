USE focusarc;

INSERT INTO characters (id, name, description, image_path) VALUES
  (1, 'Tanjiro',      'Determined and Never gives up', '/assets/characters/tanjiro.jpg'),
  (2, 'L',            'Analytical and Sharp Thinker.', '/assets/characters/l.jpg'),
  (3, 'Sung Jin-Woo', 'Focused and self-disciplined.', '/assets/characters/sung.jpg'),
  (4, 'Gilgamesh',    'Strategic and confident.',  '/assets/characters/gilgamesh.jpg'),
  (5, 'Alucard',      'Fearless ,Calm and Unshakable', '/assets/characters/alucard.jpg');

INSERT INTO quotes (character_id, quote_text) VALUES
  (1, 'Set your heart ablaze. Focus only on what you can do right now.'),
  (1, 'No matter how many scars it leaves, keep moving forward.'),
  (1, 'Discipline today, legacy tomorrow.'),
  (1, 'One quest at a time. Keep moving forward.'),
  (1, 'Even the smallest effort, given fully, moves you forward.'),
  (2, 'The only victory that matters is the one over yourself.'),
  (2, 'Whatever you decide to do, give it everything you have.'),
  (2, 'A calm mind solves what a rushed one never will.'),
  (2, 'Small, deliberate steps outperform sudden bursts of effort.'),
  (2, 'There is always a way forward, if you are willing to think.'),
  (3, 'I have to get stronger. One study session at a time.'),
  (3, 'Consistency is the real power-up.'),
  (3, 'Every rank starts at zero. Keep climbing.'),
  (3, 'The grind you put in today is the strength you have tomorrow.'),
  (3, 'Arise, and finish what you started.'),
  (4, 'A king does not fear a challenge — he masters it.'),
  (4, 'Command your time, or it will command you.'),
  (4, 'Mediocrity is the only true enemy.'),
  (4, 'Treasure your focus above all else.'),
  (4, 'Gaze upon your goals, and let nothing stand between.'),
  (5, 'Fear is only for those who have not committed fully.'),
  (5, 'Relentless effort bends even the hardest task.'),
  (5, 'Push through the night; the work will still be there at dawn.'),
  (5, 'Discipline is the sharpest weapon you own.'),
  (5, 'Composure under pressure is its own kind of strength.');

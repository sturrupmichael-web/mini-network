-- Nano Networks: six new handcrafted maps get their own leaderboards.
-- Widens the map check on nn_scores; nothing else changes.
alter table public.nn_scores drop constraint if exists nn_scores_map_check;
alter table public.nn_scores add constraint nn_scores_map_check check (
  map in (
    'florida-region', 'coast-to-coast', 'campus',
    'lake-ring', 'port-town', 'the-pass', 'downtown', 'twin-cities', 'archipelago'
  )
);

-- Centre and spread of the measures the reading judges against, from the collected visitors.
-- Run in the Supabase SQL editor (project sang-exhibition). Use it when there are about 30 or
-- more rows; then compare with dist/calibration.js (CALIBRATION), dist/sanjeong.js (STOP_RULES.center),
-- dist/ohaeng.js (FOREHEAD_OVER_JAW.center, scale) and dist/pairs.js (PAIR_CALIBRATION.cheekAsym).
with m as (
  select id, gender, age, (values->>'faceRatio')::float as face_ratio,
    ((values->>'foreheadFace')::float - (values->>'jawCheek')::float) as forehead_over_jaw,
    (values->>'stopMidLow')::float as stop_mid_low,
    ((values->>'stopMiddle')::float - (values->>'stopLower')::float) / (((values->>'stopMiddle')::float + (values->>'stopLower')::float) / 2) as stop_gap_tip,
    (values->>'cheekAsym')::float as cheek_asym,
    (values->>'eyeAsym')::float as eye_asym
  from measurements where confidence >= 50
)
select 'faceRatio' as measure, count(face_ratio) as n, round(avg(face_ratio)::numeric,3) as centre, round(stddev(face_ratio)::numeric,3) as spread from m
union all select 'foreheadFace - jawCheek (ohaeng zD, now 5.31 / 2.0)', count(forehead_over_jaw), round(avg(forehead_over_jaw)::numeric,3), round(stddev(forehead_over_jaw)::numeric,3) from m
union all select 'stop gap at the nose tip (STOP_RULES.center now -0.27)', count(stop_gap_tip), round(avg(stop_gap_tip)::numeric,3), round(stddev(stop_gap_tip)::numeric,3) from m
union all select 'cheekAsym (now 3.0 / 2.0, a guess)', count(cheek_asym), round(avg(cheek_asym)::numeric,3), round(stddev(cheek_asym)::numeric,3) from m
union all select 'eyeAsym', count(eye_asym), round(avg(eye_asym)::numeric,3), round(stddev(eye_asym)::numeric,3) from m;

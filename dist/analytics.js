export const SAMPLE_STEP = 100;

export function sample(sim) {
  return {
    time: sim.time,
    admitted: sim.admitted,
    main: sim.main.length,
    trunk: sim.groups.map(group => group.boxes.length),
    lines: sim.stations.map(s => [s.used,s.missed,s.stock,s.received])
  };
}

export function analyze(rows, indices, groupIndices, minutes) {
  const aggregate = (row, field) => indices.reduce((sum, i) => sum + row.lines[i][field], 0);
  const data = [];
  let baseline = rows[0];
  for (let index = 1; index < rows.length; index++) {
    const end = rows[index];
    if (end.time < baseline.time + minutes * 60 && index < rows.length - 1) continue;
    const length = (end.time - baseline.time) / 60;
    if (!length) continue;
    const difference = field => aggregate(end,field)-aggregate(baseline,field);
    data.push({
      time: end.time, rate: difference(0) / length, used: difference(0), missed: difference(1),
      stock: aggregate(end,2), main: end.main,
      inTransit: groupIndices.reduce((sum,i) => sum + end.trunk[i],0),
      feed: (end.admitted - baseline.admitted) / length, received: difference(3) / length
    });
    baseline = end;
  }
  return data;
}

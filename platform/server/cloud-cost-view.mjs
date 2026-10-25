// Packaged clients released before precise recipe costs validate the old
// per-unit rounding rule. Project their response without changing saved costs.
export function cloudCostView(result,precision){
 if(precision==='extended-v1'||!result?.state?.sales?.some(s=>s.lines?.some(l=>l.costCents!==Math.round(l.qty*l.unitCostCents))))return result;
 const view=structuredClone(result);
 for(const sale of view.state.sales){
  for(const line of sale.lines){delete line.rawUnitCostCents;line.costCents=Math.round(line.qty*line.unitCostCents);}
  sale.costCents=sale.lines.reduce((total,line)=>total+line.costCents,0);
 }
 return view;
}

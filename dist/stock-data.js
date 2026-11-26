import {toCsv} from './analytics-data.js?v=14';
export function selectedDemand(result,indices){return [...new Set(indices)].reduce((sum,j)=>sum+(result.lines[j]?.enabled?result.lines[j].rate:0),0);}
export function stockPoints(result,line,from=0,to=result.duration,maxPoints=480){
 const rows=result.telemetry.rows,points=[];
 for(const row of rows)if(row.t>=from-1e-7&&row.t<=to+1e-7)points.push({t:row.t,value:row.stock[line],min:row.t<=from+1e-7?row.stock[line]:(row.stockMin?.[line]??row.stock[line]),max:row.t<=from+1e-7?row.stock[line]:(row.stockMax?.[line]??row.stock[line])});
 if(points.length<=maxPoints)return points;
 const bucket=Math.ceil(points.length/Math.max(1,Math.floor(maxPoints/4))),out=[];
 for(let a=0;a<points.length;a+=bucket){
  const b=Math.min(points.length,a+bucket);let low=a,high=a;
  for(let k=a+1;k<b;k++){if(points[k].min<points[low].min)low=k;if(points[k].max>points[high].max)high=k;}
  for(const k of [...new Set([a,low,high,b-1])].sort((x,y)=>x-y))out.push(points[k]);
 }
 return out;
}
export function instantaneousStocksCsv(result,indices,from,to){
 const rows=[['Linha','Instante s','Caixas no ramal','Minimo observado desde amostra anterior cx','Maximo observado desde amostra anterior cx','Caixas em transito','Maquina liberada','Consumo configurado cx/min']];
 for(const row of result.telemetry.rows)if(row.t>=from-1e-7&&row.t<=to+1e-7)for(const j of indices)rows.push([result.lines[j].name,row.t,row.stock[j],row.stockMin?.[j]??row.stock[j],row.stockMax?.[j]??row.stock[j],row.transit[j],row.running[j]?'sim':'não',result.lines[j].enabled?result.lines[j].rate:0]);
 return toCsv(rows);
}

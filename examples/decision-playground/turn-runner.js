// Pure turn simulation: time and rendering never advance the game.
export const ACTIONS = Array.from({length:5},(_,i)=>({id:`lane-${i+1}`,description:`Move to lane ${i+1} for the next row`}));
export function course(seed=1,length=180){
 let s=seed>>>0;const random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;},lane=()=>Math.floor(random()*5),rows=[];
 while(rows.length<length){
  const gap=lane(),ramp=lane(),gap2=lane(),safe=lane();
  const wall=Array(5).fill('WALL');wall[gap]='COIN';rows.push(wall);
  const approach=Array(5).fill('EMPTY');approach[ramp]='RAMP';approach[(ramp+1+Math.floor(random()*4))%5]='COIN';rows.push(approach);
  rows.push(Array(5).fill('TRENCH'));
  const partial=Array.from({length:5},()=>random()<.65?'TRENCH':'EMPTY');partial[safe]='COIN';partial[(safe+1)%5]='TRENCH';rows.push(partial);
  const wall2=Array(5).fill('WALL');wall2[gap2]='EMPTY';rows.push(wall2);
  const risk=Array.from({length:5},()=>random()<.5?'WALL':'COIN');risk[lane()]='COIN';rows.push(risk);
 }
 return rows.slice(0,length);
}
export function freshTurnRunner(seed=1){return {seed:seed>>>0,rows:course(seed),index:0,lane:3,jump:false,rowsSurvived:0,coins:0,trenchesJumped:0,over:false,causeOfDeath:null};}
export function stepTurn(g,action){
 if(g.over)throw Error('Game is over');
 if(!ACTIONS.some(a=>a.id===action))throw Error('Invalid action');
 const lane=Number(action.slice(-1)),cells=g.rows[g.index];if(!cells)throw Error('Course complete');
 const object=cells[lane-1],jump=g.jump;
 g.lane=lane;g.index++;
 if(object==='WALL'||object==='TRENCH'&&!jump){g.over=true;g.causeOfDeath=object==='WALL'?'wall':cells.every(c=>c==='TRENCH')?'missed ramp':'trench';}
 else{g.rowsSurvived++;if(object==='COIN')g.coins++;if(object==='TRENCH')g.trenchesJumped++;}
 // A ramp is entered only while grounded. A jump lasts exactly one row.
 g.jump=!g.over&&!jump&&object==='RAMP';
 return {lane,object,jump,dead:g.over};
}
export function turnState(g){return {currentLane:g.lane,jumpingNextRow:g.jump,rows:g.rows.slice(g.index,g.index+6).map((cells,i)=>({row:i+1,cells:cells.map((object,l)=>({lane:l+1,object}))}))};}
export function turnContext(g,{input='both',instructions=true,images=1}={},history=[]){
 const context={text:'Survive as many rows as possible; collect optional coins when safe. Choose one of five lanes for the next row. Any lane change is possible in one turn. The world waits for your answer. The nearest upcoming row is row 1; lanes run left to right, 1 to 5.'};
 if(instructions)context.text+=' Go ONTO a ramp the row before a trench. Walls always kill, even while jumping. Trenches kill unless jumping. Entering a ramp while grounded makes you jump over exactly the next row, in any lane. Coins are optional. A lit JUMP READY badge means the next row is a jump.';
 if(input!=='images')context.state=turnState(g);
 if(input!=='state'){const frames=history.slice(-Math.min(2,Math.max(1,images)));if(!frames.length)throw Error('Rendered image required');context.images=frames;context.text+=' Images are chronological, newest last.';}
 return context;
}
// Dynamic programming baseline: maximize surviving rows, then coins over the
// whole known course. No provider, timing assumptions, or hidden safe-action filter.
export function perfectTurnAction(g){
 const memo=new Map();
 function solve(index,jump){
  if(index>=g.rows.length)return {survival:0,coins:0,lane:3};
  const key=`${index}:${jump}`;if(memo.has(key))return memo.get(key);
  let best={survival:-1,coins:-1,lane:1};
  g.rows[index].forEach((object,i)=>{
   if(object==='WALL'||object==='TRENCH'&&!jump)return;
   const next=solve(index+1,!jump&&object==='RAMP'),candidate={survival:next.survival+1,coins:next.coins+(object==='COIN'?1:0),lane:i+1};
   if(candidate.survival>best.survival||candidate.survival===best.survival&&candidate.coins>best.coins)best=candidate;
  });memo.set(key,best);return best;
 }
 return `lane-${solve(g.index,g.jump).lane}`;
}
export function turnMetrics(g){return {seed:g.seed,rowsSurvived:g.rowsSurvived,trenchesJumped:g.trenchesJumped,coins:g.coins,causeOfDeath:g.causeOfDeath};}

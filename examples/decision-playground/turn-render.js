// This renderer is shared by the visible game and the model's observation.
export function drawTurn(ctx,g,{progress=0,target=g.lane,time=0,death=0,last=null,status='READY'}={}){
 // Hold the collision row under the runner during its crash/fall.
 if(g.over){g={...g,index:g.index-1};progress=1;}
 const W=900,H=700;ctx.save();ctx.scale(ctx.canvas.width/W,ctx.canvas.height/H);
 const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#101c40');sky.addColorStop(.5,'#516482');sky.addColorStop(1,'#142939');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#ffc99b';ctx.beginPath();ctx.arc(685,155,49,0,Math.PI*2);ctx.fill();
 for(let i=0;i<18;i++){const h=35+(i*37)%100;ctx.fillStyle=i%2?'#263650':'#30415c';ctx.fillRect(i*57,245-h,42,h);}
 const p=(lane,d)=>{const z=1/(1+.43*Math.max(-.15,d));return {x:450+(lane-3)*145*z,y:165+480*z,z};};
 function poly(points,color,stroke){ctx.beginPath();points.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
 poly([{x:0,y:700},{x:0,y:245},{x:900,y:245},{x:900,y:700}],'#284b51');
 poly([p(.35,0),p(.35,12),p(5.65,12),p(5.65,0)],'#182934','#58cdd0');
 for(let lane=1.5;lane<5;lane++)for(let d=0;d<12;d+=.6){const a=p(lane,d-progress*.6),b=p(lane,d+.24-progress*.6);ctx.strokeStyle='#93c5c655';ctx.lineWidth=3*a.z;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
 for(let r=5;r>=0;r--){
  const cells=g.rows[g.index+r];if(!cells)continue;const d=r+1-progress,mid=p(3,d);
  ctx.fillStyle='#d2eeee';ctx.font=`600 ${Math.max(12,19*mid.z)}px system-ui`;ctx.textAlign='left';const edge=p(5.72,d);ctx.fillText(`+${r+1}`,edge.x,edge.y);
  for(let lane=1;lane<=5;lane++){
   const obj=cells[lane-1],q=p(lane,d),z=q.z,w=112*z,h=75*z;
   const a=p(lane-.44,d-.23),b=p(lane+.44,d-.23),c=p(lane+.44,d+.23),e=p(lane-.44,d+.23);
   if(obj==='TRENCH'){poly([a,b,c,e],'#030a13','#dd7863');poly([e,c,{x:c.x,y:c.y+16*z},{x:e.x,y:e.y+16*z}],'#553d42');ctx.fillStyle='#b15d54';ctx.fillRect(q.x-w*.25,q.y+7*z,w*.5,2*z);}
   if(obj==='WALL'){
    ctx.fillStyle='#0005';ctx.fillRect(q.x-w/2-5*z,q.y-4*z,w+14*z,10*z);
    poly([{x:q.x+w/2,y:q.y},{x:q.x+w/2+12*z,y:q.y-12*z},{x:q.x+w/2+12*z,y:q.y-h-12*z},{x:q.x+w/2,y:q.y-h}],'#693e44');
    poly([{x:q.x-w/2,y:q.y-h},{x:q.x-w/2+12*z,y:q.y-h-12*z},{x:q.x+w/2+12*z,y:q.y-h-12*z},{x:q.x+w/2,y:q.y-h}],'#e9a084');
    ctx.fillStyle='#b76558';ctx.fillRect(q.x-w/2,q.y-h,w,h);ctx.strokeStyle='#713f42';ctx.lineWidth=2*z;
    for(let j=1;j<4;j++){const y=q.y-j*h/4;ctx.beginPath();ctx.moveTo(q.x-w/2,y);ctx.lineTo(q.x+w/2,y);ctx.stroke();}
    for(let j=0;j<4;j++)for(let k=0;k<3;k++){const x=q.x-w/2+(k+.5*(j%2))*w/3;ctx.beginPath();ctx.moveTo(x,q.y-j*h/4);ctx.lineTo(x,q.y-(j+1)*h/4);ctx.stroke();}
   }
   if(obj==='RAMP'){
    const lift=38*z,topE={x:e.x,y:e.y-lift},topC={x:c.x,y:c.y-lift};poly([a,b,topC,topE],'#20c7b6','#b3fff0');poly([b,c,topC],'#087b83');
    ctx.strokeStyle='#edffb4';ctx.lineWidth=4*z;ctx.beginPath();ctx.moveTo(q.x,q.y+10*z);ctx.lineTo(q.x,q.y-23*z);ctx.lineTo(q.x-10*z,q.y-12*z);ctx.moveTo(q.x,q.y-23*z);ctx.lineTo(q.x+10*z,q.y-12*z);ctx.stroke();
   }
   if(obj==='COIN'){ctx.save();ctx.translate(q.x,q.y-24*z);ctx.scale(Math.max(.3,Math.abs(Math.cos(time/320+lane))),1);ctx.fillStyle='#ffca39';ctx.strokeStyle='#fff3a0';ctx.lineWidth=3*z;ctx.beginPath();ctx.ellipse(0,0,15*z,21*z,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#9d6710';ctx.font=`bold ${24*z}px system-ui`;ctx.textAlign='center';ctx.fillText('$',0,8*z);ctx.restore();}
  }
 }
 // Lane numbers stay attached to the road, not to an abstract grid.
 ctx.font='bold 20px system-ui';ctx.textAlign='center';for(let lane=1;lane<=5;lane++){const q=p(lane,0);ctx.fillStyle='#abd8db';ctx.fillText(lane,q.x,681);}
 const ease=progress*progress*(3-2*progress),lane=g.lane+(target-g.lane)*ease,q=p(lane,0);
 const jump=g.jump?Math.sin(Math.PI*progress)*115:((g.rows[g.index]?.[target-1]==='RAMP')?Math.max(0,progress-.65)*95:0);
 ctx.fillStyle='#0007';ctx.beginPath();ctx.ellipse(q.x,640,31,9,0,0,Math.PI*2);ctx.fill();
 ctx.save();ctx.translate(q.x,628-jump+(g.causeOfDeath==='wall'?0:death*150));ctx.rotate(g.causeOfDeath==='wall'?death*1.5:0);ctx.globalAlpha=1-death*.8;
 const stride=progress?Math.sin(progress*Math.PI*4)*17:Math.sin(time/220)*2;
 ctx.lineCap='round';ctx.lineWidth=13;ctx.strokeStyle='#d5f2ee';
 for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*9,-37);ctx.lineTo(side*13+side*stride,-16);ctx.lineTo(side*17-side*stride,0);ctx.stroke();ctx.strokeStyle='#2dd7cf';ctx.beginPath();ctx.moveTo(side*17,-66);ctx.lineTo(side*27-side*stride,-44);ctx.stroke();ctx.strokeStyle='#d5f2ee';}
 ctx.fillStyle='#f0f6e9';ctx.fillRect(-17,-77,34,43);ctx.fillStyle='#ff986a';ctx.fillRect(-11,-70,22,17);ctx.fillStyle='#dcf5ef';ctx.beginPath();ctx.roundRect(-20,-114,40,33,11);ctx.fill();ctx.fillStyle='#112b46';ctx.fillRect(-15,-103,30,12);ctx.fillStyle='#63fff3';ctx.fillRect(-11,-100,8,5);ctx.fillRect(3,-100,8,5);ctx.restore();
 // HUD is part of the exact observation image, including jump state.
 ctx.fillStyle='#0a142be8';ctx.fillRect(20,18,860,95);ctx.textAlign='left';ctx.fillStyle='#6de9d9';ctx.font='bold 14px system-ui';ctx.fillText('RESTAP  /  LANE RUNNER',38,43);ctx.fillStyle='#f4f6ee';ctx.font='bold 25px system-ui';ctx.fillText(`${g.rowsSurvived} ROWS     ${g.coins} COINS     ${g.trenchesJumped} JUMPS`,38,78);
 ctx.font='12px system-ui';ctx.fillStyle='#b3cbd8';ctx.fillText(`SEED ${g.seed}   •   LANE ${g.lane}   •   ${status}`,38,99);ctx.textAlign='right';ctx.fillStyle=g.jump?'#ffda69':'#adc6cd';ctx.font='bold 15px system-ui';ctx.fillText(g.jump?'JUMP READY':'GROUNDED',858,43);
 if(last){ctx.font='12px system-ui';ctx.fillStyle='#dce9ed';ctx.fillText(`${last.action??'No decision'} · ${Math.round(last.latency??0)} ms`,858,63);for(let i=1;i<=5;i++){const x=649+(i-1)*42,pct=last.probabilities?.[`lane-${i}`];ctx.fillStyle='#405061';ctx.fillRect(x,88,32,4);ctx.fillStyle='#62e3d1';if(Number.isFinite(pct))ctx.fillRect(x,88,32*pct,4);ctx.fillStyle='#cbd9df';ctx.fillText(`${i}`,x+18,83);}}
 if(g.over){ctx.fillStyle='#101a2acc';ctx.fillRect(245,302,410,92);ctx.fillStyle='#ffb09a';ctx.textAlign='center';ctx.font='bold 30px system-ui';ctx.fillText(g.causeOfDeath==='wall'?'CRASH':'MISSED THE LANDING',450,340);ctx.font='17px system-ui';ctx.fillText(g.causeOfDeath,450,370);}
 ctx.restore();
}

import { useId } from 'react';
import './experiment-robot-portrait.css';

export type ExperimentRobotPortraitProps = {
  family: 'ground' | 'air' | 'mecanum' | 'generic';
  selected?: boolean;
  motion?: boolean;
  variant?: number;
};

type Point = readonly [number,number,number];
type Material = 'body' | 'payload' | 'tire' | 'metal' | 'propeller';
type Face = { points:Point[];material:Material;light:number;depth:number };
const CAMERA:Point = [1,1,1];
const LIGHT:Point = [0.25,-0.45,1];

/**
 * Rigid silhouettes, in metres, from robot-description/ros1/{scout,fs150,
 * mecanum}_description/urdf/*_visual.urdf. Joint centres below are kept in
 * their actual base_link coordinates. Bodies simplify their visual meshes;
 * every surface, axle, wheel and propeller uses the same isometric projection.
 */
export function ExperimentRobotPortrait({ family,selected = false,motion = true,variant = 0 }: ExperimentRobotPortraitProps) {
  const shadow = `${useId()}-shadow`;
  const faces = vehicleFaces(family).sort((a,b) => a.depth - b.depth);
  const vertices = faces.flatMap((face) => face.points.map(project));
  const minX = Math.min(...vertices.map(([x]) => x));
  const maxX = Math.max(...vertices.map(([x]) => x));
  const minY = Math.min(...vertices.map(([,y]) => y));
  const maxY = Math.max(...vertices.map(([,y]) => y));
  const scale = Math.min(180 / (maxX - minX),116 / (maxY - minY));
  const offsetX = 110 - (minX + maxX) * scale / 2;
  const offsetY = 99 - (minY + maxY) * scale / 2;
  const path = (points:readonly Point[]) => points.map((point,index) => {
    const [x,y] = project(point);
    return `${index ? 'L' : 'M'}${(offsetX+x*scale).toFixed(3)} ${(offsetY+y*scale).toFixed(3)}`;
  }).join(' ') + 'Z';
  return (
    <svg className="experiment-robot-portrait" viewBox="0 0 220 180" aria-hidden="true" focusable="false"
      data-family={family} data-selected={selected} data-motion={motion} data-variant={variant}>
      <defs><radialGradient id={shadow}>
        <stop className="experiment-robot-portrait-shadow-center" />
        <stop offset="1" className="experiment-robot-portrait-shadow-edge" />
      </radialGradient></defs>
      <ellipse cx="110" cy="151" rx="77" ry="12" fill={`url(#${shadow})`} />
      <g className="experiment-robot-portrait-body">
        {faces.map((face,index) => <path key={index} d={path(face.points)} className="experiment-robot-portrait-face"
          style={{ fill:`color-mix(in srgb, var(--portrait-${face.material}-high) ${face.light.toFixed(1)}%, var(--portrait-${face.material}-low))` }} />)}
      </g>
    </svg>
  );
}

/** Orthographic camera along (1,1,1); all three world axes remain 120° apart. */
function project([x,y,z]:Point):readonly [number,number] {
  return [(x-y)*Math.sqrt(3)/2,(x+y)/2-z];
}

function vehicleFaces(family:ExperimentRobotPortraitProps['family']) {
  const faces:Face[] = [];
  const add = (points:Point[],material:Material) => {
    const normal = unit(cross(subtract(points[1]!,points[0]!),subtract(points[2]!,points[0]!)));
    if (dot(normal,CAMERA) <= 0.000001) return;
    faces.push({ points,material,light:38 + 57*Math.max(0,dot(normal,unit(LIGHT))),
      depth:points.reduce((sum,point) => sum+dot(point,CAMERA),0)/points.length });
  };
  const prism = (outline:readonly (readonly [number,number])[],bottom:number,top:number,material:Material) => {
    add(outline.map(([x,y]):Point => [x,y,top]),material);
    outline.forEach(([x,y],index) => {
      const [nextX,nextY] = outline[(index+1)%outline.length]!;
      add([[x,y,bottom],[nextX,nextY,bottom],[nextX,nextY,top],[x,y,top]],material);
    });
  };
  const box = ([x,y,z]:Point,[sx,sy,sz]:Point,material:Material,bevel = 0) => {
    const a=sx/2,b=sy/2,c=Math.min(bevel,a,b);
    const outline:readonly (readonly [number,number])[] = c ? [
      [-a+c,-b],[a-c,-b],[a,-b+c],[a,b-c],[a-c,b],[-a+c,b],[-a,b-c],[-a,-b+c],
    ] : [[-a,-b],[a,-b],[a,b],[-a,b]];
    prism(outline.map(([px,py]) => [x+px,y+py]),z-sz/2,z+sz/2,material);
  };
  const cylinder = (from:Point,to:Point,radius:number,material:Material,segments = 16) => {
    const axis = unit(subtract(to,from));
    const u = unit(cross(axis,Math.abs(axis[2]) < 0.9 ? [0,0,1] : [0,1,0]));
    const v = cross(axis,u);
    const ring = (center:Point) => Array.from({ length:segments },(_,index):Point => {
      const angle = index*Math.PI*2/segments;
      return addPoint(center,addPoint(multiply(u,Math.cos(angle)*radius),multiply(v,Math.sin(angle)*radius)));
    });
    const near = ring(to),far = ring(from);
    add(near,material);add([...far].reverse(),material);
    far.forEach((point,index) => {
      const next=(index+1)%segments;
      add([point,far[next]!,near[next]!,near[index]!],material);
    });
  };
  const wheel = (center:Point,radius:number,width:number,mecanum:boolean) => {
    cylinder(addPoint(center,[0,-width/2,0]),addPoint(center,[0,width/2,0]),radius,'tire',20);
    cylinder(addPoint(center,[0,width/2,0]),addPoint(center,[0,width/2+0.002,0]),radius*0.46,'metal',16);
    if (!mecanum) return;
    // Rollers share the wheel's actual Y axle. Each roller lies diagonally
    // between that axle and the tangent at its own circumference point.
    for(let index=0;index<8;index+=1) {
      const angle=index*Math.PI/4;
      const position=addPoint(center,[Math.cos(angle)*radius,0,Math.sin(angle)*radius]);
      const hand=center[0]*center[1] > 0 ? 1 : -1;
      const direction=unit([-Math.sin(angle)*hand,1,Math.cos(angle)*hand]);
      cylinder(addPoint(position,multiply(direction,-width*0.46)),addPoint(position,multiply(direction,width*0.46)),radius*0.13,'metal',8);
    }
  };

  if (family === 'ground') {
    // Scout: four continuous wheel joints, exact xyz from scout_visual.urdf.
    const joints:Point[] = [[0.2319755,0.2082515,-0.100998],[0.2319755,-0.2082515,-0.099998],[-0.2319755,0.2082515,-0.100998],[-0.2319755,-0.2082515,-0.099998]];
    box([0,0,-0.025],[0.53,0.35,0.115],'body',0.025);
    // box_joint is at z=0.055. The low payload replaces mesh detail, not its joint.
    box([0,0,0.055],[0.37,0.28,0.07],'payload',0.015);
    for(const joint of joints) {
      cylinder([joint[0],0,joint[2]],joint,0.019,'metal',8);
      wheel(joint,0.095,0.072,false);
    }
  } else if (family === 'mecanum') {
    // Nexus: URDF wheel joints at ±0.150m, z=.05; radius .05m, width .0505m.
    box([0,0,0.075],[0.416,0.25,0.05],'body',0.009);
    box([0,0,0.103],[0.35,0.22,0.006],'payload',0.006);
    for(const x of [-0.15,0.15]) for(const y of [-0.15,0.15]) {
      cylinder([x,Math.sign(y)*0.108,0.05],[x,y,0.05],0.012,'metal',8);
      wheel([x,y,0.05],0.05,0.0505,true);
    }
    // The existing stereo camera is a single small body-mounted module.
    box([0.205,0,0.06],[0.02,0.08,0.01],'metal');
  } else if (family === 'air') {
    // FS150 rotor_0..3 joint xyz from fs150_visual.urdf, including rear asymmetry.
    const rotors:Point[] = [[0.13,-0.22,0.023],[-0.13,0.2,0.023],[0.13,0.22,0.023],[-0.13,-0.2,0.023]];
    box([0,0,0],[0.225,0.13,0.058],'body',0.028);
    box([0,0,0.035],[0.17,0.085,0.016],'payload',0.018);
    for(const [index,rotor] of rotors.entries()) {
      const [x,y,z]=rotor;
      cylinder([x*0.35,y*0.2,-0.006],[x,y,z-0.012],0.011,'body',8);
      cylinder([x,y,z-0.04],[x,y,z-0.003],0.018,'metal',16);
      // One rigid two-blade propeller centred exactly on the rotor joint Z axis.
      const angle=(index%2 ? -18 : 18)*Math.PI/180;
      const blade=Array.from({ length:16 },(_,pointIndex):readonly [number,number] => {
        const theta=pointIndex*Math.PI/8,px=Math.cos(theta)*0.098,py=Math.sin(theta)*0.012;
        return [x+px*Math.cos(angle)-py*Math.sin(angle),y+px*Math.sin(angle)+py*Math.cos(angle)];
      });
      prism(blade,z-0.0015,z+0.0015,'propeller');
      cylinder([x,y,z],[x,y,z+0.006],0.01,'metal',12);
    }
  } else {
    box([0,0,0.055],[0.35,0.25,0.11],'body',0.025);
    box([0,0,0.115],[0.29,0.19,0.012],'payload',0.016);
  }
  return faces;
}

function addPoint(a:Point,b:Point):Point { return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]; }
function subtract(a:Point,b:Point):Point { return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]; }
function multiply(a:Point,value:number):Point { return [a[0]*value,a[1]*value,a[2]*value]; }
function dot(a:Point,b:Point) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a:Point,b:Point):Point { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
function unit(point:Point):Point { return multiply(point,1/Math.hypot(...point)); }

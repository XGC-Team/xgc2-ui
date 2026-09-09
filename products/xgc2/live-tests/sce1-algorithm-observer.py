import sys,json,time,math
import rospy
from std_msgs.msg import String,UInt32,Float64MultiArray
from geometry_msgs.msg import PoseStamped,TwistStamped
rospy.init_node('sce1_integration_probe',anonymous=True)
mode=sys.argv[1];values={};times=[]
# Emergency abort only; normal mission actions are clicked through the UI.
field_stop=rospy.Publisher('/command',String,queue_size=1)
def record(m,key):values[key]=m
subs=[]
for key,topic,typ in [('status','/sce1_central_controller/status',String),('step','/sce1_central_controller/step',UInt32),('regret','/sce1_central_controller/average_dynamic_regret',Float64MultiArray)]:subs.append(rospy.Subscriber(topic,typ,record,callback_args=key))
for name in ['ugv1','ugv2']+['uav%d'%i for i in range(1,6)]:
 subs.append(rospy.Subscriber('/'+name+'/pose',PoseStamped,record,callback_args=name))
 if name.startswith('uav'):
  subs.append(rospy.Subscriber('/'+name+'/custom/statustext',String,record,callback_args=name+'state'))
  subs.append(rospy.Subscriber('/'+name+'/mavros/local_position/velocity_local',TwistStamped,record,callback_args=name+'velocity'))
start=time.monotonic();hold=None;initial_step=None
while time.monotonic()-start<180:
 rospy.sleep(.1)
 status=values.get('status');step=values.get('step');status=status.data.split()[0] if status else '';step=step.data if step else 0
 if status=='FAULT':raise RuntimeError('SCE1 entered FAULT at step %s'%step)
 names=['uav%d'%i for i in range(1,6)]
 if not all(n in values and n+'state' in values and n+'velocity' in values for n in names):continue
 z=[values[n].pose.position.z for n in names];states=[values[n+'state'].data for n in names];vel=[values[n+'velocity'].twist.linear for n in names];speeds=[math.sqrt(v.x*v.x+v.y*v.y+v.z*v.z) for v in vel]
 if mode=='hover':ok=all(s=='Hover' for s in states) and all(abs(h-3)<.15 for h in z) and max(speeds)<.15
 elif mode=='landed':ok=all(h<.35 for h in z) and max(speeds)<.25
 elif mode=='midpoint':ok=step>=300
 elif mode=='finished':ok=status=='FINISHED' and step>=1000
 elif mode=='stopped':
  if initial_step is None:initial_step=step
  if step!=initial_step:raise RuntimeError('algorithm advanced during Stop')
  ok=all(s=='Hover' for s in states) and max(speeds)<.15 and status=='HOLD'
 else:raise ValueError(mode)
 if mode in ('midpoint','finished'):
  for n in ['ugv1','ugv2']+names:
   if n not in values:continue
   p=values[n].pose.position
   if not(-7.0<p.x<7.0 and -4.4<p.y<4.4 and (not n.startswith('uav') or .5<p.z<3.5)):
    field_stop.publish(String(data='hover'))
    raise RuntimeError('venue braking boundary '+n+str(p))
 if ok:
  if hold is None:hold=rospy.Time.now().to_sec()
  if rospy.Time.now().to_sec()-hold>=1.0:
   reg=values.get('regret');print(json.dumps({'mode':mode,'status':status,'step':step,'z':z,'speed':speeds,'rosTime':rospy.Time.now().to_sec(),'averageRegret':[v if math.isfinite(v) else None for v in reg.data] if reg else []}));break
 else:hold=None
else:raise RuntimeError('gate timed out '+mode+' '+status+' '+str(step)+' '+str(z)+' '+str(states))

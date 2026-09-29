"""Read-only projection oracle: plant model pose plus the camera asset's REP-103 optical joint."""
import json,sys,math
import cv2,numpy as np,rospy
from gazebo_msgs.srv import GetModelState
from sensor_msgs.msg import CameraInfo
from tf.transformations import quaternion_matrix,euler_matrix,quaternion_from_matrix
frozen=json.loads(sys.argv[1]);parameters=json.loads(sys.argv[2])
rospy.init_node('xgc_camera_plant_projection',anonymous=True,disable_signals=True)
rospy.wait_for_service('/gazebo/get_model_state',timeout=10)
state=rospy.ServiceProxy('/gazebo/get_model_state',GetModelState)(parameters['modelName'],'world')
if not state.success: raise RuntimeError(state.status_message)
p=state.pose;matrix=quaternion_matrix([p.orientation.x,p.orientation.y,p.orientation.z,p.orientation.w]);matrix[:3,3]=[p.position.x,p.position.y,p.position.z]
# fixed_rgb_camera.urdf.xacro: lens optical origin 67 mm ahead of the model's camera link.
joint=euler_matrix(-math.pi/2,0,-math.pi/2);joint[0,3]=0.067
truth=matrix.dot(joint);inverse=np.linalg.inv(truth)
info=rospy.wait_for_message('/xgc/camera/world/camera_info',CameraInfo,timeout=10)
rotation,_=cv2.Rodrigues(inverse[:3,:3]);markers=frozen['markers'];world=np.array([m['position'] for m in markers],dtype=float)
pixels,_=cv2.projectPoints(world.reshape(-1,1,3),rotation,inverse[:3,3],np.array(info.K).reshape(3,3),np.array(info.D))
optical=inverse[:3,:3].dot(world.T).T+inverse[:3,3]
points=[{'marker':m['name'],'pixel':uv.tolist()} for m,uv,xyz in zip(markers,pixels.reshape(-1,2),optical) if xyz[2]>0 and 0<=uv[0]<info.width and 0<=uv[1]<info.height]
print(json.dumps({'points':points,'translation':truth[:3,3].tolist(),'quaternion':quaternion_from_matrix(truth).tolist()}))

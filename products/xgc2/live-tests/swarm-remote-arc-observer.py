"""Read Gazebo truth while the browser owns remote-control input."""
import json
import math
import sys
import time

import rospy
from gazebo_msgs.srv import GetModelState

rospy.init_node('remote_arc_observer', anonymous=True)
rospy.wait_for_service('/gazebo/get_model_state', timeout=10)
state = rospy.ServiceProxy('/gazebo/get_model_state', GetModelState)
start = rospy.Time.now().to_sec()
deadline = time.monotonic() + 75
samples = []
while True:
    if time.monotonic() > deadline:
        raise RuntimeError('Simulation clock did not advance during remote observation')
    observed = state(sys.argv[1], 'world')
    if not observed.success:
        raise RuntimeError(observed.status_message)
    q = observed.pose.orientation
    yaw = math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y*q.y + q.z*q.z))
    v = observed.twist.linear
    now = rospy.Time.now().to_sec()
    samples.append(dict(t=now, x=observed.pose.position.x, y=observed.pose.position.y,
                        yaw=yaw, forward=math.cos(yaw)*v.x + math.sin(yaw)*v.y,
                        lateral=-math.sin(yaw)*v.x + math.cos(yaw)*v.y,
                        yawRate=observed.twist.angular.z, speed=math.hypot(v.x, v.y)))
    if now - start >= float(sys.argv[2]):
        break
    time.sleep(.05)
print(json.dumps(samples))

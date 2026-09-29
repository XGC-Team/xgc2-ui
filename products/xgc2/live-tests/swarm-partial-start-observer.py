"""Observe real incoming pose/FCU messages without commanding physical hardware."""
import json
import sys
import time
import rospy
from geometry_msgs.msg import PoseStamped
from mavros_msgs.msg import State

robots = json.loads(sys.argv[1])
rospy.init_node('xgc_partial_start_observer', anonymous=True, disable_signals=True)
observed = {r['id']: dict(id=r['id'], kind=r['kind'], source=r['source'], poseMessages=0,
                        firstPoseStamp=None, lastPoseStamp=None, stateMessages=0, connected=False) for r in robots}


def pose(message, robot_id):
    row = observed[robot_id]
    row['poseMessages'] += 1
    stamp = message.header.stamp.to_sec()
    if row['firstPoseStamp'] is None:
        row['firstPoseStamp'] = stamp
    row['lastPoseStamp'] = stamp


def state(message, robot_id):
    observed[robot_id]['stateMessages'] += 1
    observed[robot_id]['connected'] = observed[robot_id]['connected'] or message.connected


subscribers = []
for robot in robots:
    subscribers.append(rospy.Subscriber(robot['namespace'] + '/pose', PoseStamped, pose, callback_args=robot['id']))
    if robot['kind'] == 'px4_multirotor':
        subscribers.append(rospy.Subscriber(robot['namespace'] + '/mavros/state', State, state, callback_args=robot['id']))
time.sleep(5)
print(json.dumps(list(observed.values())))

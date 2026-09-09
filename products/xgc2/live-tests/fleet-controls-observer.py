"""Read-only simulation oracle for operator controls, using frozen roster poses."""
import json
import math
import sys
import time

import rospy
from geometry_msgs.msg import PoseStamped, TwistStamped
from gazebo_msgs.msg import ModelStates
from mavros_msgs.msg import State
from std_msgs.msg import String, UInt32

rospy.init_node('xgc_controls_acceptance', anonymous=True, disable_signals=True)
robots = json.loads(sys.argv[1])
mode = sys.argv[2]
values = {}
received = {}
subscriptions = []


def record(message, key):
    values[key] = message
    received[key] = time.monotonic()


for robot in robots:
    name = robot['namespace'].strip('/')
    for suffix, message_type, key in ([] if robot['kind'] == 'px4_multirotor' else [
        ('simulation/ground_truth/pose', PoseStamped, 'pose'),
        ('simulation/ground_truth/twist', TwistStamped, 'twist'),
    ]):
        subscriptions.append(rospy.Subscriber('/' + name + '/' + suffix, message_type,
                                              record, callback_args=name + ':' + key))
    controller_topic = ('custom/statustext' if robot['kind'] == 'px4_multirotor' else
                        'alg/' + ('mecanum' if robot['kind'] == 'mecanum_ugv' else 'unicycle') +
                        '_ugv_controller/status/control_state')
    subscriptions.append(rospy.Subscriber('/' + name + '/' + controller_topic,
                                          String if robot['kind'] == 'px4_multirotor' else UInt32,
                                          record, callback_args=name + ':controller'))
    if robot['kind'] == 'px4_multirotor':
        subscriptions.append(rospy.Subscriber('/' + name + '/mavros/state', State,
                                              record, callback_args=name + ':state'))

# PX4's simulation model does not publish the UGV-specific ground_truth topics.
# Use Gazebo's world-frame plant state, never local MAVROS altitude as touchdown proof.
def plant_states(message):
    models = {name: index for index, name in enumerate(message.name)}
    for robot in robots:
        if robot['kind'] != 'px4_multirotor':
            continue
        name = robot['namespace'].strip('/')
        index = models.get(name)
        if index is None:
            continue
        record(PoseStamped(pose=message.pose[index]), name + ':pose')
        record(TwistStamped(twist=message.twist[index]), name + ':twist')


subscriptions.append(rospy.Subscriber('/gazebo/model_states', ModelStates, plant_states, queue_size=1))

deadline = time.monotonic() + 180
first = {}
stable_since = None
last = []
while time.monotonic() < deadline and not rospy.is_shutdown():
    time.sleep(0.05)
    now = time.monotonic()
    last = []
    complete = True
    for robot in robots:
        name = robot['namespace'].strip('/')
        keys = [name + ':pose', name + ':twist', name + ':controller']
        aerial = robot['kind'] == 'px4_multirotor'
        if aerial:
            keys.append(name + ':state')
        if any(key not in values or now - received[key] > 3 for key in keys):
            complete = False
            continue
        p = values[name + ':pose'].pose.position
        q = values[name + ':pose'].pose.orientation
        v = values[name + ':twist'].twist.linear
        position = [p.x, p.y, p.z]
        first.setdefault(name, position)
        speed = math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
        travel = math.dist(first[name], position)
        target = robot['initialPose']
        error = math.hypot(p.x - target['x'], p.y - target['y'])
        yaw = math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
        yaw_error = abs(math.atan2(math.sin(yaw - target['yaw']), math.cos(yaw - target['yaw'])))
        armed = values[name + ':state'].armed if aerial else False
        if not all(math.isfinite(x) for x in position + [speed, error, yaw_error]):
            raise RuntimeError('Non-finite telemetry for ' + name)
        if abs(p.x) > 7 or abs(p.y) > 4.4 or p.z > 3.6 or p.z < -0.15:
            raise RuntimeError('Robot outside experiment envelope: ' + name + str(position))
        controller = values[name + ':controller'].data
        if mode == 'motion':
            passed = travel > 0.1 and controller == ('Custom1' if aerial else 3) and (not aerial or (armed and p.z > 0.5))
        elif mode == 'hover':
            passed = speed < 0.2 and (not aerial or (armed and 2.7 < p.z < 3.3))
        elif mode == 'stopped':
            passed = speed < 0.15 and (not aerial or (armed and 0.5 < p.z < 3.5))
        elif mode == 'landed':
            passed = speed < 0.2 and (not aerial or (not armed and -0.1 < p.z < 0.35))
        elif mode == 'reset':
            # T14: Reset arrival is planar 5 cm, with no final-heading gate.
            passed = speed < 0.15 and (aerial or (error <= 0.05 and controller == 2))
        else:
            raise ValueError(mode)
        last.append(dict(name=name, poseSource=('/gazebo/model_states:' + name if aerial else '/' + name + '/simulation/ground_truth/pose'), position=position, speed=speed, displacementM=travel,
                         initialPoseErrorM=error, yawError=yaw_error, armed=armed, controller=controller, passed=passed))
    if complete and last and all(item['passed'] for item in last):
        stable_since = stable_since or now
        if now - stable_since > (0.2 if mode == 'motion' else 1):
            print(json.dumps(dict(mode=mode, robots=last)))
            break
    else:
        stable_since = None
else:
    raise RuntimeError('Control gate timed out: ' + mode + ' ' + json.dumps(last))

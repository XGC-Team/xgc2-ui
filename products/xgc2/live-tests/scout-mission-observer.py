"""Verify initial placement, then UI-issued Track/Stop and one stadium lap."""
import json
import math
import select
import sys
import time

import rospy
from geometry_msgs.msg import PoseStamped, TwistStamped
from nav_msgs.msg import Path
from std_msgs.msg import Float64MultiArray, String, UInt8, UInt32

rospy.init_node('xgc_scout_mission_observer', anonymous=True, disable_signals=True)
names = ['ugv%d' % i for i in range(1, 5)]
poses, twists, states = {}, {}, {}
initial_poses = {robot['name']: robot['initialPose'] for robot in json.loads(sys.argv[1])}
if set(initial_poses) != set(names):
    raise RuntimeError('Frozen experiment initialPose must identify all four Scouts')
for name, pose in initial_poses.items():
    if not all(math.isfinite(float(pose[key])) for key in ('x', 'y', 'z', 'yaw')):
        raise RuntimeError('Frozen initialPose is invalid for ' + name)
rolling, predicted, leaders = {}, {}, {}
phase = 'preparing'
track_requested = False
track_requested_wall = None
lap_start = None
lap_points, travel, previous = {}, {}, {}
lap_leader_start = {}
extent_min, extent_max = {}, {}
field = {'widthM': 15.0, 'depthM': 10.0, 'bodyRadiusM': 0.43, 'brakingReserveM': 0.22}
field['centerLimitX'] = field['widthM']/2 - field['bodyRadiusM'] - field['brakingReserveM']
field['centerLimitY'] = field['depthM']/2 - field['bodyRadiusM'] - field['brakingReserveM']
centroid_min, centroid_max = [math.inf] * 3, [-math.inf] * 3
max_position = {'x': -math.inf, 'y': -math.inf}
fault = []
stable_since = None
wall_deadline = time.monotonic() + 900
# This publisher is exclusively the existing experimental boundary brake.
brake = rospy.Publisher('/command', String, queue_size=1)


def emit(kind, **value):
    print(json.dumps(dict(kind=kind, simTime=rospy.Time.now().to_sec(), **value)), flush=True)


def distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def fail(message):
    if not fault:
        fault.append(message)


def pose_callback(message, name):
    p = message.pose.position
    q = message.pose.orientation
    pose = [p.x, p.y, p.z, math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y*q.y + q.z*q.z))]
    poses[name] = pose
    if abs(p.x) > field['centerLimitX'] or abs(p.y) > field['centerLimitY']:
        fail('Field braking guard triggered: ' + json.dumps({'robot': name, 'position': pose[:3]}))
        brake.publish(String(data='stop'))


def command_callback(message, name=None):
    global track_requested, track_requested_wall
    command = message.data.strip().lower()
    if command in ('track', 'tracking', 'custom', 'custom1', 'start'):
        if phase == 'preparing':
            fail('Tracking command arrived before initial placement and Ready were verified')
        if not track_requested:
            track_requested_wall = time.monotonic()
            emit('tracking-command-observed', command=command, robot=name)
        track_requested = True


def state_callback(message, name):
    states[name] = message.data


def rolling_callback(message):
    caller = getattr(message, '_connection_header', {}).get('callerid', '')
    if isinstance(caller, bytes):
        caller = caller.decode()
    if caller not in {'/' + name + '/mpc' for name in names}:
        fail('Unexpected planner state publisher: ' + str(caller))
        return
    if message.data == 0 and caller in rolling:
        del rolling[caller]
        if phase == 'tracking':
            fail('Planner left rolling during the required lap: ' + caller)
    # Planner and command callbacks use independent ROS connections. Preserve
    # the latched mode transition even if it reaches this observer first.
    if message.data == 1:
        if caller and caller not in rolling:
            rolling[caller] = rospy.Time.now().to_sec()


def read_stadium():
    keys = rospy.get_param_names()
    values = []
    for name in names:
        roots = [key[:-len('/stadium/straight_length')] for key in keys
                 if key == '/' + name + '/mpc/stadium/straight_length']
        if len(roots) != 1:
            raise RuntimeError('Expected one live stadium parameter root for %s: %s' % (name, roots))
        root = roots[0]
        values.append({'robot': name, 'parameterRoot': root,
                       'straightLengthM': float(rospy.get_param(root + '/stadium/straight_length')),
                       'curveRadiusM': float(rospy.get_param(root + '/stadium/curve_radius')),
                       'speedMps': float(rospy.get_param(root + '/leader_speed'))})
    first = values[0]
    for value in values:
        for key in ('straightLengthM', 'curveRadiusM', 'speedMps'):
            if value[key] <= 0 or abs(value[key] - first[key]) > 1e-9:
                raise RuntimeError('Stadium parameters disagree or are non-positive: ' + json.dumps(values))
    return values, (2 * first['straightLengthM'] + 2 * math.pi * first['curveRadiusM']) / first['speedMps']


subscriptions = []
for name in names:
    subscriptions.extend([
        rospy.Subscriber('/%s/simulation/ground_truth/pose' % name, PoseStamped, pose_callback, name),
        rospy.Subscriber('/%s/simulation/ground_truth/twist' % name, TwistStamped,
                         lambda m, n: twists.__setitem__(n, [m.twist.linear.x, m.twist.linear.y, m.twist.angular.z]), name),
        rospy.Subscriber('/%s/alg/unicycle_ugv_controller/status/control_state' % name, UInt32, state_callback, name),
        rospy.Subscriber('/%s/command' % name, String, command_callback, name),
        rospy.Subscriber('/%s/alg/predicted_trajectory' % name, Path,
                         lambda m, n: predicted.__setitem__(n, {'count': len(m.poses), 'frame': m.header.frame_id}), name),
        rospy.Subscriber('/%s/alg/leader_state' % name, Float64MultiArray,
                         lambda m, n: leaders.__setitem__(n, list(m.data)), name),
    ])
subscriptions.extend([
    rospy.Subscriber('/command', String, command_callback, None),
    rospy.Subscriber('/alg/formation/planning_state', UInt8, rolling_callback),
])
stadium, lap_duration = read_stadium()
while not rospy.is_shutdown() and time.monotonic() < wall_deadline:
    if select.select([sys.stdin], [], [], 0)[0]:
        if sys.stdin.readline().strip() == 'exit':
            break
    if fault:
        emit('failed', reason=fault[0])
        break
    now = rospy.Time.now().to_sec()
    if len(poses) < 4 or len(twists) < 4 or len(states) < 4:
        time.sleep(0.02)
        continue
    if phase == 'preparing':
        robots = []
        for name in names:
            target = initial_poses[name]
            error = distance(poses[name], [target['x'], target['y']])
            height_error = abs(poses[name][2] - target['z'])
            yaw_delta = poses[name][3] - target['yaw']
            yaw_error = abs(math.atan2(math.sin(yaw_delta), math.cos(yaw_delta)))
            speed = math.hypot(*twists[name][:2])
            ready = (states[name] == 2 and error <= 0.10 and height_error <= 0.10 and yaw_error <= 0.15
                     and speed < 0.05 and abs(twists[name][2]) < 0.1)
            robots.append({'name': name, 'initialPose': target, 'actualPose': poses[name],
                           'positionErrorM': error, 'heightErrorM': height_error, 'yawErrorRad': yaw_error,
                           'controller': states[name], 'speedMps': speed,
                           'yawRateRadps': twists[name][2], 'ready': ready})
        if all(robot['ready'] for robot in robots):
            stable_since = now if stable_since is None else stable_since
            if now - stable_since >= 1.0:
                phase = 'ready'
                emit('observer-ready', poses=poses, stadium=stadium, initialPlacement=robots,
                     lapDurationSeconds=lap_duration, fieldGuard=field,
                     reset={'status': 'NOT_TESTED', 'reason': 'Reset deferred by user'})
        else:
            stable_since = None
    if (phase == 'ready' and track_requested and len(rolling) == 4
            and len(leaders) == 4 and all(states[n] == 3 for n in names)):
        lap_start = max(rolling.values())
        lap_points = {name: poses[name][:3] for name in names}
        previous = {name: poses[name][:3] for name in names}
        travel = {name: 0.0 for name in names}
        lap_leader_start = {name: leaders[name][:] for name in names}
        extent_min = {name: poses[name][:2] for name in names}
        extent_max = {name: poses[name][:2] for name in names}
        phase = 'tracking'
        emit('tracking-started', rolling=rolling, lapStartSimTime=lap_start, lapDurationSeconds=lap_duration)
    if (phase == 'ready' and track_requested_wall is not None
            and time.monotonic() - track_requested_wall > 30):
        fail('Tracking did not start within 30 wall seconds: ' + json.dumps({
            'rolling': rolling, 'leaderRobots': sorted(leaders), 'controllerStates': states}))
    if phase == 'tracking':
        if any(states[n] != 3 for n in names):
            fail('Controller left tracking during the required lap: ' + json.dumps(states))
        for name in names:
            travel[name] += distance(poses[name], previous[name])
            previous[name] = poses[name][:3]
            extent_min[name] = [min(a, b) for a, b in zip(extent_min[name], poses[name][:2])]
            extent_max[name] = [max(a, b) for a, b in zip(extent_max[name], poses[name][:2])]
            max_position['x'] = max(max_position['x'], poses[name][0])
            max_position['y'] = max(max_position['y'], poses[name][1])
        centroid = [sum(poses[n][axis] for n in names) / 4 for axis in range(3)]
        centroid_min = [min(a, b) for a, b in zip(centroid_min, centroid)]
        centroid_max = [max(a, b) for a, b in zip(centroid_max, centroid)]
        if now - lap_start >= lap_duration:
            phase = 'lap-complete'
            robots = [{'name': name, 'controller': states[name], 'travelM': travel[name],
                       'start': lap_points[name], 'end': poses[name][:3],
                       'predictedPoints': predicted.get(name, {}).get('count', 0),
                       'predictedFrame': predicted.get(name, {}).get('frame', ''),
                       'startToEndDistanceM': distance(poses[name], lap_points[name]),
                       'spanXY': [hi-lo for lo, hi in zip(extent_min[name], extent_max[name])],
                       'leaderStateStart': lap_leader_start[name], 'leaderStateEnd': leaders.get(name, []),
                       'leaderClosureErrorM': distance(lap_leader_start[name], leaders[name])} for name in names]
            emit('lap-complete', robots=robots, lapStartSimTime=lap_start, lapEndSimTime=now,
                 lapDurationSeconds=lap_duration, elapsedSimSeconds=now-lap_start,
                 stadium=stadium,
                 maxPosition=max_position, centroidSpan=dict(zip(('x', 'y', 'z'),
                 [hi-lo for lo, hi in zip(centroid_min, centroid_max)])))
    time.sleep(0.02)
else:
    emit('failed', reason='Observer wall-time deadline reached before UI mission cleanup')

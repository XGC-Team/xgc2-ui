"""Exercise ROS callback ordering without starting a ROS master or a vehicle."""
import ast
import json
import math
from pathlib import Path
from types import SimpleNamespace
import unittest


def observer_callbacks():
    source = Path(__file__).with_name('scout-mission-observer.py').read_text()
    tree = ast.parse(source)
    functions = {'command_callback', 'rolling_callback', 'fail', 'field_guard', 'pose_callback', 'stadium_position'}
    module = ast.Module(body=[node for node in tree.body
                              if isinstance(node, ast.FunctionDef) and node.name in functions], type_ignores=[])
    events = []
    brakes = []
    values = dict(phase='ready', track_requested=False, track_requested_wall=None,
                  rolling={}, fault=[], names=['ugv%d' % i for i in range(1, 5)],
                  poses={}, json=json, math=math, String=SimpleNamespace,
                  brake=SimpleNamespace(publish=lambda command: brakes.append(command.data)), brakes=brakes,
                  time=SimpleNamespace(monotonic=lambda: 100.0),
                  rospy=SimpleNamespace(Time=SimpleNamespace(now=lambda: SimpleNamespace(to_sec=lambda: 23.252))),
                  emit=lambda kind, **value: events.append(dict(kind=kind, **value)), events=events)
    exec(compile(module, '<observer callbacks>', 'exec'), values)
    return values


class ScoutMissionObserverCallbacksTest(unittest.TestCase):
    def test_stadium_stops_at_declared_hold_instead_of_requiring_lap_closure(self):
        position = observer_callbacks()['stadium_position']
        geometry = dict(straightLengthM=6, curveRadiusM=3, speedMps=.3,
                        initialX=-3, initialY=-3, holdDistanceM=12 + 4.5*math.pi)
        lap = (12 + 6*math.pi) / .3
        for elapsed in [geometry['holdDistanceM']/.3, lap, 2*lap]:
            with self.subTest(elapsed=elapsed):
                x, y = position(geometry, elapsed)
                self.assertAlmostEqual(x, -6)
                self.assertAlmostEqual(y, 0)
        geometry['holdDistanceM'] = 0
        self.assertAlmostEqual(position(geometry, lap)[0], -3)
        self.assertAlmostEqual(position(geometry, lap)[1], -3)

    def test_asymmetric_control_bounds_accept_interior_and_reserved_edges(self):
        observer = observer_callbacks()
        observer['field'] = observer['field_guard']({'controlBounds': {
            'xMin': 10, 'xMax': 20, 'yMin': -8, 'yMax': -2,
        }})
        for x, y in [(15, -5), (10.65, -7.35), (19.35, -2.65)]:
            with self.subTest(x=x, y=y):
                message = SimpleNamespace(pose=SimpleNamespace(
                    position=SimpleNamespace(x=x, y=y, z=0),
                    orientation=SimpleNamespace(x=0, y=0, z=0, w=1)))
                observer['pose_callback'](message, 'ugv1')
                self.assertEqual(observer['poses']['ugv1'][:2], [x, y])
                self.assertEqual(observer['fault'], [])
                self.assertEqual(observer['brakes'], [])

    def test_each_asymmetric_reserved_boundary_brakes_when_crossed(self):
        for x, y in [(10.64, -5), (19.36, -5), (15, -7.36), (15, -2.64)]:
            with self.subTest(x=x, y=y):
                observer = observer_callbacks()
                observer['field'] = observer['field_guard']({'controlBounds': {
                    'xMin': 10, 'xMax': 20, 'yMin': -8, 'yMax': -2,
                }})
                message = SimpleNamespace(pose=SimpleNamespace(
                    position=SimpleNamespace(x=x, y=y, z=0),
                    orientation=SimpleNamespace(x=0, y=0, z=0, w=1)))
                observer['pose_callback'](message, 'ugv1')
                self.assertIn('Field braking guard triggered', observer['fault'][0])
                self.assertEqual(observer['brakes'], ['stop'])

    def test_missing_control_bounds_is_a_test_configuration_error(self):
        observer = observer_callbacks()
        for boundary in [None, {}, {'controlBounds': None}, {'controlBounds': {}}]:
            with self.subTest(boundary=boundary):
                with self.assertRaisesRegex(RuntimeError, 'test configuration.*controlBounds'):
                    observer['field_guard'](boundary)

    def test_global_command_callback_accepts_rospy_single_argument(self):
        observer = observer_callbacks()
        # rospy omits callback_args when Subscriber receives None.
        observer['command_callback'](SimpleNamespace(data='track'))
        self.assertTrue(observer['track_requested'])
        self.assertEqual(observer['fault'], [])
        self.assertEqual(observer['events'][0]['robot'], None)

    def test_rolling_before_command_is_preserved_for_all_four_planners(self):
        observer = observer_callbacks()
        for index in range(1, 5):
            observer['rolling_callback'](SimpleNamespace(data=1, _connection_header={
                'callerid': ('/ugv%d/mpc' % index).encode()}))
        self.assertFalse(observer['track_requested'])
        self.assertEqual(len(observer['rolling']), 4)
        observer['command_callback'](SimpleNamespace(data='track'))
        self.assertTrue(observer['track_requested'])
        self.assertEqual(len(observer['rolling']), 4)

    def test_repeated_track_burst_does_not_restart_or_fail_the_lap(self):
        observer = observer_callbacks()
        observer['command_callback'](SimpleNamespace(data='track'))
        observer['phase'] = 'tracking'
        for _ in range(15):
            observer['command_callback'](SimpleNamespace(data='track'))
        self.assertEqual(observer['fault'], [])
        self.assertEqual(len(observer['events']), 1)
        self.assertEqual(observer['track_requested_wall'], 100.0)

    def test_track_before_initial_placement_fails(self):
        observer = observer_callbacks()
        observer['phase'] = 'preparing'
        observer['command_callback'](SimpleNamespace(data='track'))
        self.assertIn('before initial placement', observer['fault'][0])

    def test_hold_during_lap_and_foreign_publishers_are_not_accepted(self):
        observer = observer_callbacks()
        observer['rolling_callback'](SimpleNamespace(data=1, _connection_header={'callerid': '/ugv1/mpc'}))
        observer['phase'] = 'tracking'
        observer['rolling_callback'](SimpleNamespace(data=0, _connection_header={'callerid': '/ugv1/mpc'}))
        self.assertEqual(observer['rolling'], {})
        self.assertIn('left rolling', observer['fault'][0])
        observer = observer_callbacks()
        observer['rolling_callback'](SimpleNamespace(data=1, _connection_header={'callerid': '/other/mpc'}))
        self.assertEqual(observer['rolling'], {})
        self.assertIn('Unexpected planner', observer['fault'][0])


if __name__ == '__main__':
    unittest.main()

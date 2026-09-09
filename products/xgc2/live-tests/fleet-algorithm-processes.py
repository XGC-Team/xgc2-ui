"""Read-only OS evidence for workflow-owned planner and controller lifetimes."""
import json
import os

packages = ('px4_multirotor_controller', 'unicycle_ugv_controller',
            'mecanum_ugv_controller', 'formation_generator')
rows = []
for entry in os.listdir('/proc'):
    if not entry.isdigit():
        continue
    try:
        with open('/proc/' + entry + '/cmdline', 'rb') as stream:
            argv = stream.read().decode().split('\x00')
        # Python nodes have their script in argv[1], native nodes in argv[0].
        if not any('/lib/' + package + '/' in argument
                   for package in packages for argument in argv[:2]):
            continue
        with open('/proc/' + entry + '/environ', 'rb') as stream:
            environment = stream.read().decode().split('\x00')
        # Keep only the public ROS namespace, never export process credentials.
        namespace = next((value[len('ROS_NAMESPACE='):] for value in environment
                          if value.startswith('ROS_NAMESPACE=')), '')
        namespace = next((value[len('__ns:='):] for value in argv
                          if value.startswith('__ns:=')), namespace)
        rows.append(dict(pid=int(entry), argv=argv, namespace='/' + namespace.strip('/')))
    except (OSError, UnicodeError):
        # A process may exit between listing /proc and reading its metadata.
        continue
print(json.dumps(rows))

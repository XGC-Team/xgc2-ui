import { describe,expect,it } from 'vitest';
import { flightRobotInstrumentReadout,flightArmedTone,flightModeTone } from './flightInstrumentModel';
import {
  groundRobotInstrumentReadout,
  scoutControlModeLabel,
  scoutChassisModeTone,
} from './groundInstrumentModel';
import { twistLinearSpeed2Norm } from './robotTelemetryValues';

describe('Robot instrument readouts', () => {
  it('maps semantic Robot Adapter channels into flight-instrument values', () => {
    const orientation = quaternionFromEuler(10,-5,123);
    const value = flightRobotInstrumentReadout({
      presentation: 'fs150',
      online: true,
      linkFresh: true,
      poseFresh: true,
      mocapState: 'fresh',
      healthTone: 'healthy',
      flight: { connected: true,armed: true,mode: 'OFFBOARD',landedState: 3 },
      pose: { position: { x: 12.5,y: -3.25,z: 4.75 },orientation },
      mocapPose: { position: { x: 12.25,y: -3,z: 4.5 } },
      imu: { orientation },
      localVelocity: { linear: { x: 0.1,y: 0.2,z: 0.3 } },
      mocapVelocity: { linear: { x: 3,y: 4,z: -0.5 } },
      mocapSpeed: { metersPerSecond: 6.25 },
      localizationError: { meters: 0.123 },
      localSetpoint: { coordinateFrame: 'LOCAL_COORDINATE_FRAME_NED',validFields: 255 },
      localSetpointState: 'fresh',
      power: { percentage: 0.76,voltageV: 27.11,currentA: -2.4 },
      health: { positioning: { state:'POSITIONING_STATE_ACTIVE' } },
      fcuLink: { roundTripTimeMs: 18.25 },
      streamHealth: { channels: [
        { channelId: 'state.imu',sourceRateHz: 50 },
        { channelId: 'state.pose',sourceRateHz: 20 },
        { channelId: 'state.mocap.pose',sourceRateHz: 19 },
        { channelId: 'state.mocap.velocity',sourceRateHz: 15 },
        { channelId: 'setpoint.local',sourceRateHz: 10 },
      ] },
    });

    expect(value.roll).toBeCloseTo(10,5);
    expect(value.pitch).toBeCloseTo(-5,5);
    expect(value.yaw).toBeCloseTo(123,5);
    expect(value.speed).toBeCloseTo(Math.hypot(3,4,-0.5),5);
    expect(value).toMatchObject({
      online: true,connected: true,armed: true,mode: 'OFFBOARD',flightStage: 'TAKEOFF',
      altitude: 4.5,climb: 0.3,positionErrorCm: 12.3,x: 12.5,y: -3.25,
      battery: 76,batteryVoltage: 27.11,batteryCurrent: -2.4,
      mocapPosition: { x: 12.25,y: -3,z: 4.5 },mocapVelocity: { x: 3,y: 4,z: -0.5 },
      localSetpoint: 'NED · 0xff',roundTripTimeMs: 18.25,positioning: true,positioningStatus:'ready',mocap: 'fresh',healthTone: 'healthy',
      frequencies: { imu: 50,localPosition: 20,mocapPosition: 19,mocapVelocity: 15,localSetpoint: 10 },
    });
  });

  it('does not synthesize battery or FCU latency when channels are absent', () => {
    const value = flightRobotInstrumentReadout({
      presentation: 'fs150',online: false,linkFresh: false,poseFresh: false,mocapState: 'missing',healthTone: 'unavailable',
      flight: {},pose: {},mocapPose: {},imu: {},localVelocity: {},mocapVelocity: {},mocapSpeed: {},localizationError: {},
      localSetpoint: {},localSetpointState: 'missing',power: {},streamHealth: {},fcuLink: {},
    });

    expect(value).toMatchObject({
      online: false,connected: false,armed: null,battery: null,batteryVoltage: null,batteryCurrent: null,
      roundTripTimeMs: null,
      speed: null,altitude: null,climb: null,x: null,y: null,
      mocapPosition: { x: null,y: null,z: null },mocapVelocity: { x: null,y: null,z: null },
      localSetpoint: '--',positioning: false,mocap: '--',flightStage: '--',
    });
  });

  it('uses Adapter source rates and never substitutes throttled output rates',() => {
    const value = flightRobotInstrumentReadout({
      presentation:'fs150',online:true,linkFresh:true,poseFresh:true,mocapState:'fresh',healthTone:'healthy',
      flight:{ connected:true },pose:{},mocapPose:{},imu:{},localVelocity:{},mocapVelocity:{},mocapSpeed:{},
      localizationError:{},localSetpoint:{},localSetpointState:'missing',power:{},fcuLink:{},
      streamHealth:{ channels:[
        { channelId:'state.imu',sourceRateHz:8,outputRateHz:99 },
        { channelId:'setpoint.local',sourceRateHz:3,outputRateHz:88 },
        { channelId:'state.mocap.pose',sourceRateHz:50,outputRateHz:10 },
        { channelId:'state.pose',sourceRateHz:9,outputRateHz:77 },
      ] },
    });
    expect(value.frequencies).toMatchObject({
      imu:8,localSetpoint:3,mocapPosition:50,localPosition:9,visionPose:0,
    });
  });

  it('reads measured vision pose sourceRateHz and never assumes 30 Hz', () => {
    const missing = flightRobotInstrumentReadout({
      presentation:'fs150',online:true,linkFresh:true,poseFresh:true,mocapState:'fresh',healthTone:'healthy',
      flight:{ connected:true },pose:{},mocapPose:{},imu:{},localVelocity:{},mocapVelocity:{},mocapSpeed:{},
      localizationError:{},localSetpoint:{},localSetpointState:'missing',power:{},fcuLink:{},
      streamHealth:{ channels:[] },
    });
    const measured = flightRobotInstrumentReadout({
      presentation:'fs150',online:true,linkFresh:true,poseFresh:true,mocapState:'fresh',healthTone:'healthy',
      flight:{ connected:true },pose:{},mocapPose:{},imu:{},localVelocity:{},mocapVelocity:{},mocapSpeed:{},
      localizationError:{},localSetpoint:{},localSetpointState:'missing',power:{},fcuLink:{},
      streamHealth:{ channels:[
        { channelId:'state.vision.pose',sourceRateHz:28.4,outputRateHz:30 },
      ] },
    });
    expect(missing.frequencies.visionPose).toBe(0);
    expect(measured.frequencies.visionPose).toBe(28.4);
  });

  it('uses placeholders for unavailable flight state', () => {
    const disconnected = flightRobotInstrumentReadout({
      presentation: 'fs150',online: false,linkFresh: false,poseFresh: false,mocapState: 'missing',healthTone: 'unavailable',
      flight: { armed: false },pose: {},mocapPose: {},imu: {},localVelocity: {},mocapVelocity: {},mocapSpeed: {},localizationError: {},
      localSetpoint: {},localSetpointState: 'missing',power: {},streamHealth: {},fcuLink: {},
    });
    const connected = flightRobotInstrumentReadout({
      presentation: 'fs150',online: true,linkFresh: true,poseFresh: false,mocapState: 'missing',healthTone: 'fault',
      flight: { connected: true },pose: {},mocapPose: {},imu: {},localVelocity: {},mocapVelocity: {},mocapSpeed: {},localizationError: {},
      localSetpoint: {},localSetpointState: 'stale',power: {},streamHealth: {},fcuLink: {},
    });

    expect(disconnected).toMatchObject({ armed: null });
    expect(connected.armed).toBe(false);
  });

  it('uses the Mocap Rotor local-state channels without requiring FS150 VRPN inputs', () => {
    const value = flightRobotInstrumentReadout({
      presentation: 'mocap_rotor',online: true,linkFresh: true,poseFresh: true,mocapState: 'missing',healthTone: 'healthy',
      flight: { connected: true,armed: false,mode: 'POSCTL' },
      pose: { position: { x: 1,y: 2,z: 3 },orientation: { x: 0,y: 0,z: 0,w: 1 } },
      mocapPose: {},imu: { orientation: { x: 0,y: 0,z: 0,w: 1 } },
      localVelocity: { linear: { x: 0.5,y: 0,z: -0.1 } },mocapVelocity: {},mocapSpeed: { metersPerSecond: 0.5 },
      localizationError: {},localSetpoint: {},localSetpointState: 'missing',power: {},
      fcuLink: { roundTripTimeMs: 7 },streamHealth: { channels: [
        { channelId: 'state.pose',sourceRateHz: 15 },
        { channelId: 'state.velocity',sourceRateHz: 15 },
        { channelId: 'state.imu',sourceRateHz: 10 },
      ] },
    });

    expect(value).toMatchObject({
      presentation: 'mocap_rotor',linkReady: true,positioning: true,mocap: '--',
      altitude: 3,climb: -0.1,x: 1,y: 2,
      frequencies: { localPosition: 15,mocapVelocity: 15,imu: 10,localSetpoint: 0 },
    });
    expect(value.speed).toBeCloseTo(Math.hypot(0.5,0,-0.1),5);
  });

  it('uses MAVROS local pose/velocity and connected when FS150 mocap and timesync are missing', () => {
    const value = flightRobotInstrumentReadout({
      presentation: 'fs150',online: true,linkFresh: false,poseFresh: true,mocapState: 'missing',healthTone: 'healthy',
      flight: { connected: true,armed: false,mode: 'MANUAL',landedState: 1 },
      pose: { position: { x: 1.25,y: -0.5,z: 2.0 } },
      mocapPose: {},imu: {},
      localVelocity: { linear: { x: 0.3,y: 0.4,z: -0.2 } },
      mocapVelocity: {},mocapSpeed: {},localizationError: {},
      localSetpoint: {},localSetpointState: 'missing',power: { percentage: 0.81,voltageV: 24.5 },
      health: { positioning: { state:'POSITIONING_STATE_ACTIVE' } },
      fcuLink: {},
      streamHealth: { channels: [
        { channel_id: 'state.pose',source_rate_hz: 20 },
        { channelId: 'state.velocity',sourceRateHz: 18 },
      ] },
    });

    expect(value).toMatchObject({
      connected: true,linkReady: false,armed: false,mode: 'MANUAL',flightStage: 'GROUND',
      altitude: null,climb: -0.2,x: 1.25,y: -0.5,positioning: true,mocap: '--',battery: 81,
      frequencies: { localPosition: 20,mocapVelocity: 0,localSetpoint: 0 },
    });
    expect(value.speed).toBeNull();
  });

  it('uses MAVROS connected or semantic online as the link when timesync is absent', () => {
    const omitted = flightRobotInstrumentReadout({
      presentation: 'fs150',online: true,linkFresh: false,poseFresh: true,mocapState: 'missing',healthTone: 'healthy',
      flight: { mode: 'POSCTL' },pose: {},mocapPose: {},imu: {},localVelocity: {},mocapVelocity: {},mocapSpeed: {},
      localizationError: {},localSetpoint: {},localSetpointState: 'missing',power: {},streamHealth: {},fcuLink: {},
    });
    expect(omitted.connected).toBe(true);
    expect(omitted.mode).toBe('POSCTL');
  });

  it('keeps local pose and velocity zeros instead of placeholders', () => {
    const value = flightRobotInstrumentReadout({
      presentation: 'fs150',online: true,linkFresh: false,poseFresh: true,mocapState: 'missing',healthTone: 'healthy',
      flight: { connected: true,armed: false,mode: 'MANUAL',landed_state: 1 },
      pose: { position: { x: 0,y: 0,z: 0 } },
      mocapPose: {},imu: {},
      localVelocity: { linear: { x: 0,y: 0,z: 0 } },
      mocapVelocity: {},mocapSpeed: {},localizationError: {},
      localSetpoint: {},localSetpointState: 'missing',power: { percentage: 0,voltage_v: 0 },
      fcuLink: {},streamHealth: {},
    });
    expect(value).toMatchObject({
      mode: 'MANUAL',flightStage: 'GROUND',x: 0,y: 0,altitude: null,climb: 0,speed: null,battery: 0,
    });
  });

  it('maps ground-robot VRPN position and adaptor speed, power, health, and link facts', () => {
    const value = groundRobotInstrumentReadout({
      online: true,
      operationalReady: true,
      connectionState: 'live',
      poseFresh: true,
      healthTone: 'healthy',
      pose: {
        position: { x: 8.25,y: -1.5,z: 0 },
        orientation: quaternionFromEuler(0,0,135),
      },
      velocity: { linear: { x: 0.88388347648,y: -0.88388347648,z: 7 },angular: { z: -0.25 } },
      commandVelocity: { linear: { x: 1.5 },angular: { z: -0.2 } },
      speed: { metersPerSecond: 99 },
      power: {
        percentageState:'PERCENTAGE_STATE_AVAILABLE',percentage:0.95,
        voltageV:28.765,currentA:-2.4,
      },
      chassis: {
        controlMode: 'CONTROL_MODE_COMMAND_CAN',nativeControlMode: 1,
      },
      health: { online: true,summary: 'nominal' },
      streamHealth: { channels: [
        { channelId: 'vrpn.position',sourceRateHz: 20 },
        { channelId: 'vrpn.speed',sourceRateHz: 15 },
        { channelId: 'state.imu',sourceRateHz: 20,sourceAgeMs: 20,stale: false },
        { channelId: 'state.power',sourceRateHz: 1.5 },
        { channelId: 'command.velocity',sourceRateHz: 10 },
        { channelId: 'state.health',sourceRateHz: 2 },
      ] },
    });

    expect(value).toMatchObject({
      online: true,operationalReady: true,
      x: 8.25,y: -1.5,z: 0,commandLinear: 1.5,
      commandAngular: -0.2,actualAngular: -0.25,
      battery: 95,batteryVoltage: 28.765,batteryCurrent: -2.4,controlMode: 'CMD',
      health: 'nominal',connectionState: 'live',
      imuAgeMs: 20,imuStale: false,hasChassisContract: true,
      pose: 'fresh',positioningStatus:'ready',
      frequencies: { position: 20,speed: 15,imu: 20,power: 1.5,command: 10 },
    });
    expect(value.linearSpeed).toBeCloseTo(Math.hypot(0.88388347648,-0.88388347648,7),5);
    expect(value.actualLinear).toBeCloseTo(value.linearSpeed ?? NaN,5);
    expect(value.commandLinearY).toBeNull();
    expect(value.linearError).toBeCloseTo((value.linearSpeed ?? 0) - 1.5,5);
    expect(value.angularError).toBeCloseTo(-0.05,5);
    expect(value.heading).toBeCloseTo(135,5);
    expect(value.roll).toBeCloseTo(0,5);
    expect(value.pitch).toBeCloseTo(0,5);
  });

  it('reads PowerVoltage snake_case while consuming exact semantic control fields', () => {
    const value = groundRobotInstrumentReadout({
      online: true,operationalReady: true,connectionState: 'live',poseFresh: true,
      healthTone: 'healthy',pose: {},velocity: {},commandVelocity: {},speed: {},
      power: {
        percentageState:'PERCENTAGE_STATE_AVAILABLE',percentage:0.88,
        voltage_v:12.348,current_a:-1.25,
      },
      chassis: { controlMode:'CONTROL_MODE_REMOTE',nativeControlMode:0 },
      health: {},streamHealth: { channels: [{ channel_id: 'state.imu',source_rate_hz: 20 }] },
    });
    expect(value.battery).toBeCloseTo(88,5);
    expect(value.batteryVoltage).toBeCloseTo(12.348,5);
    expect(value.batteryCurrent).toBeCloseTo(-1.25,5);
    expect(value.controlMode).toBe('RC');
    expect(value.frequencies.imu).toBe(20);
  });

  it('labels unknown Scout native control modes instead of a blank dash', () => {
    expect(scoutControlModeLabel({ controlMode:'CONTROL_MODE_REMOTE' })).toBe('RC');
    expect(scoutControlModeLabel({ controlMode:'CONTROL_MODE_COMMAND_CAN' })).toBe('CMD');
    expect(scoutControlModeLabel({ controlMode:'CONTROL_MODE_COMMAND_UART' })).toBe('UART');
    expect(scoutControlModeLabel({ nativeControlMode: 3 })).toBe('MODE 3');
    expect(scoutControlModeLabel({ controlMode: 2 })).toBe('--');
    expect(scoutControlModeLabel({ nativeControlMode: 0 })).toBe('MODE 0');
    expect(scoutControlModeLabel({ nativeControlMode: 1 })).toBe('MODE 1');
    expect(scoutControlModeLabel({ nativeControlMode: 3 })).not.toBe('RC');
    expect(scoutControlModeLabel({ control_mode:'CONTROL_MODE_REMOTE',native_control_mode:3 })).toBe('--');
    expect(scoutChassisModeTone({ controlMode:'CONTROL_MODE_REMOTE' })).toBe('danger');
    expect(scoutChassisModeTone({ controlMode:'CONTROL_MODE_COMMAND_CAN' })).toBe('success');
    expect(scoutChassisModeTone({ controlMode:'CONTROL_MODE_COMMAND_UART' })).toBe('danger');
    expect(scoutChassisModeTone({ nativeControlMode:3 })).toBe('normal');
    expect(scoutChassisModeTone({})).toBe('normal');
  });

  it('paints PX4 OFFBOARD green and leaves other flight modes white', () => {
    expect(flightModeTone('OFFBOARD')).toBe('success');
    expect(flightModeTone('offboard')).toBe('success');
    expect(flightModeTone(' OFFBOARD ')).toBe('success');
    expect(flightModeTone('MANUAL')).toBe('normal');
    expect(flightModeTone('POSCTL')).toBe('normal');
    expect(flightModeTone('--')).toBe('normal');
    expect(flightModeTone('')).toBe('normal');
    expect(flightModeTone(null)).toBe('normal');
  });

  it('paints PX4 ARMED green and leaves DISARMED white', () => {
    expect(flightArmedTone(true)).toBe('success');
    expect(flightArmedTone(false)).toBe('normal');
    expect(flightArmedTone(null)).toBe('normal');
    expect(flightArmedTone(undefined)).toBe('normal');
  });

  it('does not estimate ground battery SoC when Adapter percentage is unavailable', () => {
    const value = groundRobotInstrumentReadout({
      online:true,operationalReady:true,connectionState:'live',poseFresh:true,
      healthTone:'healthy',pose:{},velocity:{},commandVelocity:{},speed:{},
      power:{
        percentageState:'PERCENTAGE_STATE_UNAVAILABLE',percentage:0.95,voltageV:28.8,
      },
      chassis:{},health:{},streamHealth:{},
    });
    expect(value.battery).toBeNull();
    expect(value.batteryVoltage).toBe(28.8);
  });

  it('uses VRPN twist linear 2-norm for ground HUD speed and ignores Adapter body-X speed', () => {
    expect(twistLinearSpeed2Norm(undefined)).toBeNull();
    expect(twistLinearSpeed2Norm({})).toBeNull();
    expect(twistLinearSpeed2Norm({ x: 3 })).toBe(3);
    expect(twistLinearSpeed2Norm({ x: 3,y: 4,z: -0.5 })).toBeCloseTo(Math.hypot(3,4,-0.5),5);
    const value = groundRobotInstrumentReadout({
      online:true,operationalReady:true,connectionState:'live',poseFresh:true,
      healthTone:'healthy',
      pose:{ orientation: quaternionFromEuler(0,0,90) },
      velocity:{ linear:{ x: 0,y: 1.25 } },
      commandVelocity:{ linear:{ x: 1 },angular:{ z: 0.1 } },
      speed:{ metersPerSecond: 99 },
      power:{},chassis:{},health:{},streamHealth:{},
    });
    expect(value.linearSpeed).toBeCloseTo(1.25,5);
    expect(value.linearError).toBeCloseTo(0.25,5);
    expect(value.heading).toBeCloseTo(90,5);
  });

  it('includes lateral and vertical twist axes in the ground HUD 2-norm', () => {
    const value = groundRobotInstrumentReadout({
      online:true,operationalReady:true,connectionState:'live',poseFresh:true,
      healthTone:'healthy',
      pose:{ orientation: quaternionFromEuler(0,0,0) },
      velocity:{ linear:{ x: 0.2,y: -0.8 } },
      commandVelocity:{ linear:{ x: 0.5,y: -0.4 },angular:{ z: 0 } },
      speed:{ metersPerSecond: 99 },
      power:{},chassis:{},health:{},streamHealth:{},
    });
    expect(value.linearSpeed).toBeCloseTo(Math.hypot(0.2,-0.8),5);
    expect(value.commandLinear).toBeCloseTo(0.5,5);
    expect(value.commandLinearY).toBeCloseTo(-0.4,5);
    expect(value.linearError).toBeCloseTo(Math.hypot(0.2,-0.8) - Math.hypot(0.5,-0.4),5);
  });

  it('keeps ground communication separate when the health channel is unavailable', () => {
    const value = groundRobotInstrumentReadout({
      online: true,operationalReady: true,connectionState: 'live',poseFresh: false,
      healthTone: 'unavailable',pose: {},velocity: {},commandVelocity: {},speed: {},power: {},chassis: {},
      health: { online: false },streamHealth: {},
    });

    expect(value).toMatchObject({
      online: true,operationalReady: false,heading: null,linearSpeed: null,x: null,y: null,z: null,
      commandLinear: null,actualLinear: null,commandAngular: null,actualAngular: null,
      controlMode: '--',health: 'unavailable',connectionState: 'live',pose: 'stale',
      imuAgeMs: null,hasChassisContract: false,positioningStatus:'unavailable',
    });
  });

  it('projects Adapter positioning liveness into the shared header icon state', () => {
    const base = {
      online:true,operationalReady:true,connectionState:'live',poseFresh:true,
      healthTone:'healthy' as const,pose:{},velocity:{},commandVelocity:{},speed:{},power:{},
      chassis:{},streamHealth:{},
    };
    expect(groundRobotInstrumentReadout({
      ...base,health:{ positioning:{ state:'POSITIONING_STATE_ACTIVE' } },
    }).positioningStatus).toBe('ready');
    expect(groundRobotInstrumentReadout({
      ...base,health:{ positioning:{ state:'POSITIONING_STATE_FROZEN' } },
    }).positioningStatus).toBe('frozen');
    expect(groundRobotInstrumentReadout({
      ...base,poseFresh:false,health:{ positioning:{ state:'POSITIONING_STATE_TIMED_OUT' } },
    }).positioningStatus).toBe('unavailable');
  });
});

function quaternionFromEuler(rollDeg: number,pitchDeg: number,yawDeg: number) {
  const [roll,pitch,yaw] = [rollDeg,pitchDeg,yawDeg].map((value) => value * Math.PI / 180);
  const [cr,sr] = [Math.cos(roll / 2),Math.sin(roll / 2)];
  const [cp,sp] = [Math.cos(pitch / 2),Math.sin(pitch / 2)];
  const [cy,sy] = [Math.cos(yaw / 2),Math.sin(yaw / 2)];
  return {
    w: cr * cp * cy + sr * sp * sy,
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
  };
}

export type Status = "normal" | "warning" | "critical" | "alarm_low" | "alarm_high" | "tripped";
export type SwitchStatus = "running" | "stopped" | "tripped" | "starting";

export interface ValueUnit {
    value: number;
    unit: string;
    status: Status;
    trend: "increasing" | "decreasing" | "stable";
}

export interface GridState {
    frequency: ValueUnit;
}

export interface GeneratorState {
    load: ValueUnit;
    reactive_power: ValueUnit;
    voltage: ValueUnit;
    frequency: ValueUnit;
    power_factor: number;
}

export interface BoilerState {
    pressure: ValueUnit;
    level: ValueUnit;
    temperature: ValueUnit;
    steam_flow_out: ValueUnit;
    feedwater_flow_in: ValueUnit;
}

export interface CoalMill {
    id: string;
    name: string;
    status: SwitchStatus;
    coal_flow: ValueUnit;
    speed: ValueUnit;
    outlet_temp: ValueUnit;
    wear_percentage: number;
    trip_priority: number;
}

export interface TurbineState {
    speed: ValueUnit;
    load: ValueUnit;
    inlet_pressure: ValueUnit;
    inlet_temp: ValueUnit;
    trip_status: boolean;
}

export interface SprayValve {
    id: string;
    name: string;
    position: ValueUnit;
    flow: ValueUnit;
    can_adjust: boolean;
}

export interface Alarm {
    id: string;
    timestamp: number;
    severity: string;
    message: string;
    equipment: string;
    acknowledged: boolean;
}

export interface PlantState {
    message_type: string;
    session_id: string;
    timestamp: number;
    scenario_time: number;

    grid: GridState;
    generator: GeneratorState;
    boiler_drum: BoilerState;
    coal_mills: CoalMill[];
    turbine: TurbineState;
    spray_water_valves: SprayValve[];
    alarms: Alarm[];

    load_rejection_active: boolean;
    scenario_mode: string;
    overall_status: string;
}

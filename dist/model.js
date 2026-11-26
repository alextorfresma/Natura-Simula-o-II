import { BOX, inlet, groups, stations } from './layout.js';

export const DEFAULTS = { feed: 90, mainSpeed: 60, branchSpeed: 60, cycle: 3, warmup: 120, hours: 8, mainInitial: 0, branchInitial: 0, alternative: 'G22' };
export const STEP = 0.1;
const EPSILON = 1e-7;

export class Simulator {
  constructor(config = {}, geometry = { inlet, groups, stations }) {
    this.config = { ...DEFAULTS, ...config };
    const bounds = { feed:[0,1000], mainSpeed:[1,300], branchSpeed:[1,300], cycle:[0.2,120], warmup:[0,3600], hours:[1/60,24], mainInitial:[0,100], branchInitial:[0,100] };
    for (const [key, [minimum, maximum]] of Object.entries(bounds)) {
      const value = Number(this.config[key]);
      if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error('Valor fora do intervalo para ' + key + '.');
      this.config[key] = value;
    }
    if (!['E18','G22'].includes(this.config.alternative)) throw new Error('Escolha E18 ou G22.');
    this.inlet = geometry.inlet;
    this.main = [];
    this.groups = geometry.groups.map(group => ({ ...group, boxes: [], stations: [], sent: 0, demand: 0, used: 0, missed: 0 }));
    this.stations = geometry.stations.map((station, index) => {
      const rate = Number(this.config.rates?.[index] ?? station.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 60) throw new Error('Consumo inválido em ' + station.name + '.');
      const active = rate > 0 && (!station.alternative || station.alternative === this.config.alternative);
      const state = { ...station, rate, active, stock: 0, reserved: 0, boxes: [], nextUse: Infinity, readyAt: 0, used: 0, missed: 0, received: 0 };
      if (active) {
        state.stock = Math.floor(station.capacity * this.config.branchInitial / 100);
        if (state.stock) state.nextUse = 60 / rate;
        const group = this.groups[station.group];
        group.stations.push(state);
        group.demand += rate;
      }
      state.lead = (station.junction + station.route.length) * 60 / this.config.branchSpeed + this.config.cycle;
      state.reservationLimit = station.capacity + Math.ceil(state.lead * rate / 60) + 1;
      return state;
    });
    this.tick = 0;
    this.time = 0;
    this.nextFeed = 0;
    const initialMain = Math.floor(Math.floor(this.inlet.length / BOX.width) * this.config.mainInitial / 100);
    this.main = Array.from({ length: initialMain }, (_, i) => ({ position: this.inlet.length - BOX.width * (i + .5) }));
    this.initial = initialMain + this.stations.reduce((sum, station) => sum + station.stock, 0);
    this.admitted = 0;
    this.shortages = [];
    this.redirected = 0;
    this.heldSeconds = 0;
    this.preferred = 0;
    this.blocked = false;
  }

  candidate(group) {
    let target = null;
    let priority = Infinity;
    for (const station of group.stations) {
      const inventory = station.stock + station.boxes.length + station.reserved;
      if (inventory >= station.reservationLimit) continue;
      const coverage = inventory * 60 / station.rate - station.lead;
      if (coverage < priority) {
        priority = coverage;
        target = station;
      }
    }
    return { target, priority, open: Boolean(target) && (!group.boxes.length || group.boxes.at(-1).position >= BOX.length * 1.5 - EPSILON) };
  }

  step() {
    this.time = ++this.tick * STEP;
    const t = this.time;
    const branchStep = this.config.branchSpeed / 60 * STEP;
    const branchHalf = BOX.length / 2;
    for (const group of this.groups) {
      for (const station of group.stations) {
        if (t + EPSILON >= station.nextUse) {
          if (station.stock) {
            station.stock--;
            if (station.gap) {
              station.gap.resumed = t;
              station.gap = null;
            }
            station.used++;
            group.used++;
          } else {
            if (!station.gap) {
              station.gap = { station:station.name, start:t, resumed:null, count:0 };
              this.shortages.push(station.gap);
            }
            station.gap.count++;
            station.missed++;
            group.missed++;
          }
          station.nextUse += 60 / station.rate;
        }
        const boxes = station.boxes;
        let limit = station.route.length - branchHalf - station.stock * BOX.length;
        let delivered = 0;
        for (let index = 0; index < boxes.length; index++) {
          const box = boxes[index];
          if (box.release <= t) box.position = Math.max(box.position, Math.min(limit, box.position + branchStep));
          if (box.release <= t && box.position >= limit - EPSILON && delivered === index) {
            station.stock++;
            station.received++;
            delivered++;
            if (station.nextUse === Infinity) station.nextUse = t + 60 / station.rate;
          }
          limit = box.position - BOX.length;
        }
        if (delivered) boxes.splice(0, delivered);
      }
      const remaining = group.boxes;
      let next = group.route.length;
      let kept = 0;
      for (const box of remaining) {
        const station = box.target;
        const exit = Math.min(group.route.length - branchHalf, Math.max(branchHalf, station.junction));
        box.position = Math.min(exit, next, box.position + branchStep);
        if (box.position >= exit - EPSILON && t + EPSILON >= station.readyAt && station.boxes.length + station.stock < station.capacity) {
          station.readyAt = t + this.config.cycle;
          station.boxes.push({ position: branchHalf, release: station.readyAt });
          station.reserved--;
        } else {
          remaining[kept++] = box;
          next = box.position - BOX.length;
        }
      }
      remaining.length = kept;
    }

    const mainEnd = this.inlet.length - BOX.width / 2;
    let limit = mainEnd;
    for (const box of this.main) {
      box.position = Math.min(limit, box.position + this.config.mainSpeed / 60 * STEP);
      limit = box.position - BOX.width;
    }
    this.blocked = false;
    if (this.main[0]?.position >= mainEnd - EPSILON) {
      const options = this.groups.map(group => this.candidate(group));
      const initializing = t <= this.config.warmup + EPSILON;
      const preferred = initializing ? this.preferred : Number(options[1].priority < options[0].priority);
      const chosen = options[preferred].open ? preferred : 1 - preferred;
      if (options[chosen].open) {
        const group = this.groups[chosen];
        const target = options[chosen].target;
        group.boxes.push({ position: branchHalf, target });
        group.sent++;
        target.reserved++;
        if (chosen !== preferred) this.redirected++;
        this.preferred = 1 - chosen;
        this.main.shift();
      } else {
        this.blocked = true;
        this.heldSeconds += STEP;
      }
    }
    if (this.config.feed && t + EPSILON >= this.nextFeed && (!this.main.length || this.main.at(-1).position >= BOX.width * 1.5 - EPSILON)) {
      this.main.push({ position: BOX.width / 2 });
      this.admitted++;
      this.nextFeed = (t - this.nextFeed > STEP + EPSILON ? t : this.nextFeed) + 60 / this.config.feed;
    }
  }

  advance(steps) {
    const end = Math.min(this.tick + steps, Math.round(this.config.hours * 3600 / STEP));
    while (this.tick < end) this.step();
    return this.tick >= Math.round(this.config.hours * 3600 / STEP);
  }

  totals() {
    const used = this.groups.reduce((sum, group) => sum + group.used, 0);
    const missed = this.groups.reduce((sum, group) => sum + group.missed, 0);
    const stored = this.stations.reduce((sum, station) => sum + station.stock + station.boxes.length, 0);
    const inSystem = this.main.length + stored + this.groups.reduce((sum, group) => sum + group.boxes.length, 0);
    return { used, missed, inSystem, conserved: used + inSystem === this.admitted + this.initial };
  }
}

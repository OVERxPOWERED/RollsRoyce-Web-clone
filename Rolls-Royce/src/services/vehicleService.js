import { validateVehicle, VehicleSchema } from '../domain/models.js';

class VehicleService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.vehicles = this.loadVehicleData();
  }

  loadVehicleData() {
    return [
      {
        id: 'rr-phantom-2024',
        name: 'Phantom',
        category: 'sedan',
        year: 2024,
        price: 450000,
        currency: 'GBP',
        engine: '6.75L V12 Twin-Turbo',
        power: '563 hp',
        torque: '900 Nm',
        acceleration: '5.4s (0-100 km/h)',
        topSpeed: '250 km/h',
        transmission: '8-speed automatic',
        drivetrain: 'RWD',
        dimensions: {
          length: 5762,
          width: 2018,
          height: 1646,
          wheelbase: 3552
        },
        weight: 2560,
        fuelConsumption: '14.2 L/100km',
        co2Emissions: '322 g/km',
        features: [
          'Starlight Headliner',
          'The Gallery',
          'Power Reserve Gauge',
          'Self-Righting Wheel Centers',
          'Bespoke Audio System',
          'Rear Theatre Configuration'
        ],
        images: [
          '/images/phantom-exterior.jpg',
          '/images/phantom-interior.jpg',
          '/images/phantom-detail.jpg'
        ],
        featured: true,
        description: 'The Phantom is the pinnacle of Rolls-Royce motor cars, representing the absolute zenith of luxury, craftsmanship, and engineering excellence.'
      },
      {
        id: 'rr-ghost-2024',
        name: 'Ghost',
        category: 'sedan',
        year: 2024,
        price: 315000,
        currency: 'GBP',
        engine: '6.75L V12 Twin-Turbo',
        power: '563 hp',
        torque: '850 Nm',
        acceleration: '4.8s (0-100 km/h)',
        topSpeed: '250 km/h',
        transmission: '8-speed automatic',
        drivetrain: 'AWD',
        dimensions: {
          length: 5546,
          width: 1979,
          height: 1571,
          wheelbase: 3295
        },
        weight: 2490,
        fuelConsumption: '13.8 L/100km',
        co2Emissions: '313 g/km',
        features: [
          'Planar Suspension System',
          'Whisper Quiet Interior',
          'Illuminated Fascia',
          'Bespoke Clock',
          'Rear Privacy Suite'
        ],
        images: [
          '/images/ghost-exterior.jpg',
          '/images/ghost-interior.jpg'
        ],
        featured: true,
        description: 'The Ghost represents the most technologically advanced Rolls-Royce ever created, combining effortless power with contemporary design.'
      },
      {
        id: 'rr-cullinan-2024',
        name: 'Cullinan',
        category: 'suv',
        year: 2024,
        price: 330000,
        currency: 'GBP',
        engine: '6.75L V12 Twin-Turbo',
        power: '563 hp',
        torque: '850 Nm',
        acceleration: '5.2s (0-100 km/h)',
        topSpeed: '250 km/h',
        transmission: '8-speed automatic',
        drivetrain: 'AWD',
        dimensions: {
          length: 5341,
          width: 2000,
          height: 1835,
          wheelbase: 3295
        },
        weight: 2660,
        fuelConsumption: '15.0 L/100km',
        co2Emissions: '341 g/km',
        features: [
          'All-Terrain Capability',
          'Viewing Suite',
          'Recreation Module',
          'Partition Glass',
          'Bespoke Rear Seating'
        ],
        images: [
          '/images/cullinan-exterior.jpg',
          '/images/cullinan-interior.jpg',
          '/images/cullinan-rear.jpg'
        ],
        featured: true,
        description: 'The Cullinan is the first all-terrain SUV from Rolls-Royce, making luxury effortless, everywhere.'
      },
      {
        id: 'rr-spectre-2024',
        name: 'Spectre',
        category: 'coupe',
        year: 2024,
        price: 320000,
        currency: 'GBP',
        engine: 'Dual Electric Motors',
        power: '577 hp',
        torque: '900 Nm',
        acceleration: '4.5s (0-100 km/h)',
        topSpeed: '250 km/h',
        transmission: 'Single-speed',
        drivetrain: 'AWD',
        dimensions: {
          length: 5453,
          width: 1947,
          height: 1573,
          wheelbase: 3210
        },
        weight: 2975,
        fuelConsumption: '0 L/100km (Electric)',
        co2Emissions: '0 g/km',
        range: '520 km (WLTP)',
        batteryCapacity: '102 kWh',
        chargingTime: '34 min (10-80% DC)',
        features: [
          'First Ultra-Luxury Electric Super Coupé',
          'Spectre Starlight Doors',
          'Digital Architecture',
          'Planar Suspension 2.0',
          'Bespoke Illuminated Grille'
        ],
        images: [
          '/images/spectre-exterior.jpg',
          '/images/spectre-interior.jpg',
          '/images/spectre-detail.jpg'
        ],
        featured: true,
        description: 'Spectre is the first fully electric Rolls-Royce, marking a historic moment for the marque and the beginning of a bold electric future.'
      },
      {
        id: 'rr-wraith-2023',
        name: 'Wraith',
        category: 'coupe',
        year: 2023,
        price: 285000,
        currency: 'GBP',
        engine: '6.6L V12 Twin-Turbo',
        power: '624 hp',
        torque: '870 Nm',
        acceleration: '4.6s (0-100 km/h)',
        topSpeed: '250 km/h',
        transmission:
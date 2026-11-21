import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { VehicleService } from '../VehicleService';

const API_BASE_URL = '/api/vehicles';

const mockVehicles = [
  {
    id: '1',
    vin: 'WBA1A5C50FD123456',
    model: 'Phantom',
    year: 2024,
    color: 'Black',
    status: 'available',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    vin: 'WBA1A5C50FD654321',
    model: 'Ghost',
    year: 2023,
    color: 'White',
    status: 'sold',
    createdAt: '2023-11-20T14:30:00Z',
    updatedAt: '2024-02-10T09:15:00Z',
  },
  {
    id: '3',
    vin: 'WBA1A5C50FD789012',
    model: 'Cullinan',
    year: 2024,
    color: 'Blue',
    status: 'reserved',
    createdAt: '2024-03-01T11:00:00Z',
    updatedAt: '2024-03-01T11:00:00Z',
  },
];

const mockVehicleDetail = {
  ...mockVehicles[0],
  specifications: {
    engine: '6.75L V12',
    horsepower: 563,
    torque: '900 Nm',
    transmission: '8-speed automatic',
    drivetrain: 'AWD',
  },
  features: [
    'Starlight Headliner',
    'Bespoke Audio',
    'Rear Theater Configuration',
    'Champagne Cooler',
  ],
  serviceHistory: [
    { date: '2024-01-15', service: 'Pre-delivery inspection', mileage: 0 },
  ],
};

const handlers = [
  http.get(API_BASE_URL, ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const status = url.searchParams.get('status');
    const model = url.searchParams.get('model');

    let filtered = [...mockVehicles];

    if (status) {
      filtered = filtered.filter((v) => v.status === status);
    }
    if (model) {
      filtered = filtered.filter((v) =>
        v.model.toLowerCase().includes(model.toLowerCase())
      );
    }

    const start = (page - 1) * limit;
    const end = start + limit;
    const paginated = filtered.slice(start, end);

    return HttpResponse.json({
      data: paginated,
      pagination: {
        page,
        limit,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / limit),
      },
    });
  }),

  http.get(`${API_BASE_URL}/:id`, ({ params }) => {
    const { id } = params;
    const vehicle = mockVehicles.find((v) => v.id === id);

    if (!vehicle) {
      return new HttpResponse(
        JSON.stringify({ error: 'Vehicle not found', code: 'VEHICLE_NOT_FOUND' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (id === '1') {
      return HttpResponse.json(mockVehicleDetail);
    }

    return HttpResponse.json(vehicle);
  }),

  http.post(API_BASE_URL, async ({ request }) => {
    const body = await request.json();

    if (!body.vin || !body.model || !body.year) {
      return new HttpResponse(
        JSON.stringify({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'vin', message: 'VIN is required' },
            { field: 'model', message: 'Model is required' },
            { field: 'year', message: 'Year is required' },
          ].filter((d) => !body[d.field]),
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (body.vin.length !== 17) {
      return new HttpResponse(
        JSON.stringify({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: [{ field: 'vin', message: 'VIN must be 17 characters' }],
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const newVehicle = {
      id: String(mockVehicles.length + 1),
      ...body,
      status: body.status || 'available',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockVehicles.push(newVehicle);

    return HttpResponse.json(newVehicle, { status: 201 });
  }),

  http.patch(`${API_BASE_URL}/:id`, async ({ params, request }) => {
    const { id } = params;
    const index = mockVehicles.findIndex((v) => v.id === id);

    if (index === -1) {
      return new HttpResponse(
        JSON.stringify({ error: 'Vehicle not found', code: 'VEHICLE_NOT_FOUND' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const updated = {
      ...mockVehicles[index],
      ...body,
      updatedAt: new Date().toISOString(),
    };

    mockVehicles[index] = updated;

    return HttpResponse.json(updated);
  }),

  http.delete(`${API_BASE_URL}/:id`, ({ params }) => {
    const { id } = params;
    const index = mockVehicles.findIndex((v) => v.id === id);

    if (index === -1) {
      return new HttpResponse(
        JSON.stringify({ error: 'Vehicle not found', code: 'VEHICLE_NOT_FOUND' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    mockVehicles.splice(index, 1);

    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API_BASE_URL}/:id/history`, ({ params }) => {
    const { id } = params;
    const vehicle = mockVehicles.find((v) => v.id === id);

    if (!vehicle) {
      return new HttpResponse(
        JSON.stringify({ error: 'Vehicle not found', code: 'VEHICLE_NOT_FOUND' }),
        {
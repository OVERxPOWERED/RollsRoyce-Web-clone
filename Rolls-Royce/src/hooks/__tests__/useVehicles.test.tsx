```tsx
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import React from 'react';

// Types
interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  color: string;
  mileage: number;
  price: number;
  status: 'available' | 'sold' | 'reserved' | 'maintenance';
  createdAt: string;
  updatedAt: string;
}

interface VehiclesResponse {
  data: Vehicle[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface CreateVehicleInput {
  make: string;
  model: string;
  year: number;
  vin: string;
  color: string;
  mileage: number;
  price: number;
}

interface UpdateVehicleInput {
  id: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  mileage?: number;
  price?: number;
  status?: Vehicle['status'];
}

// Mock data
const mockVehicles: Vehicle[] = [
  {
    id: '1',
    make: 'Rolls-Royce',
    model: 'Phantom',
    year: 2024,
    vin: 'SCA664S59RUX12345',
    color: 'Black',
    mileage: 0,
    price: 450000,
    status: 'available',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    make: 'Rolls-Royce',
    model: 'Ghost',
    year: 2023,
    vin: 'SCA664S59RUX67890',
    color: 'White',
    mileage: 1500,
    price: 350000,
    status: 'available',
    createdAt: '2023-06-20T14:30:00Z',
    updatedAt: '2023-06-20T14:30:00Z',
  },
  {
    id: '3',
    make: 'Rolls-Royce',
    model: 'Cullinan',
    year: 2024,
    vin: 'SCA664S59RUX54321',
    color: 'Blue',
    mileage: 500,
    price: 400000,
    status: 'reserved',
    createdAt: '2024-03-10T09:15:00Z',
    updatedAt: '2024-03-10T09:15:00Z',
  },
];

// MSW Handlers
const handlers = [
  http.get('/api/vehicles', async ({ request }) => {
    await delay(100);
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const status = url.searchParams.get('status');
    
    let filtered = [...mockVehicles];
    if (status) {
      filtered = filtered.filter(v => v.status === status);
    }
    
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginated = filtered.slice(start, end);
    
    return HttpResponse.json<VehiclesResponse>({
      data: paginated,
      meta: {
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
      },
    });
  }),

  http.get('/api/vehicles/:id', async ({ params }) => {
    await delay(50);
    const { id } = params;
    const vehicle = mockVehicles.find(v => v.id === id);
    
    if (!vehicle) {
      return HttpResponse.json({ message: 'Vehicle not found' }, { status: 404 });
    }
    
    return HttpResponse.json(vehicle);
  }),

  http.post('/api/vehicles', async ({ request }) => {
    await delay(200);
    const body = await request.json() as CreateVehicleInput;
    
    // Validate required fields
    if (!body.make || !body.model || !body.year || !body.vin) {
      return HttpResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Check for duplicate VIN
    if (mockVehicles.some(v => v.vin === body.vin)) {
      return HttpResponse.json(
        { message: 'Vehicle with this VIN already exists' },
        { status: 409 }
      );
    }
    
    const newVehicle: Vehicle = {
      id: String(mockVehicles.length + 1),
      ...body,
      status: 'available',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    mockVehicles.push(newVehicle);
    return HttpResponse.json(newVehicle, { status: 201 });
  }),

  http.put('/api/vehicles/:id', async ({ params, request }) => {
    await delay(150);
    const { id } = params;
    const body = await request.json() as UpdateVehicleInput;
    
    const index = mockVehicles.findIndex(v => v.id === id);
    if (index === -1) {
      return HttpResponse.json({ message: 'Vehicle not found' }, { status: 404 });
    }
    
    const updatedVehicle: Vehicle = {
      ...mockVehicles[index],
      ...body,
      updatedAt: new Date().toISOString(),
    };
    
    mockVehicles[index] = updatedVehicle;
    return HttpResponse.json(updatedVehicle);
  }),

  http.patch('/api/vehicles/:id', async ({ params, request }) => {
    await delay(150);
    const { id } = params;
    const body = await request.json() as Partial<UpdateVehicleInput>;
    
    const index = mockVehicles.findIndex(v => v.id === id);
    if (index === -1) {
      return HttpResponse.json({ message: 'Vehicle not found' }, { status: 404 });
    }
    
    const updatedVehicle: Vehicle = {
      ...mockVehicles[index],
      ...body,
      updatedAt: new Date().toISOString(),
    };
    
    mockVehicles[index] = updatedVehicle;
    return HttpResponse.json(updatedVehicle);
  }),

  http.delete('/api/vehicles/:id', async ({ params }) => {
    await delay(100);
    const { id } = params;
    const index = mockVehicles.findIndex(v => v.id === id);
    
    if (index === -1) {
      return HttpResponse.json({ message: 'Vehicle not found' }, { status: 40
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'vitest-axe';
import { vi, expect, describe, it, beforeEach, afterEach } from 'vitest';
import VehicleList from './VehicleList';
import { VehicleProvider } from '../../context/VehicleContext';

expect.extend(toHaveNoViolations);

const mockVehicles = [
  {
    id: '1',
    name: 'Phantom',
    model: 'Phantom VIII',
    year: 2024,
    price: 450000,
    image: '/images/phantom.jpg',
    description: 'The flagship luxury sedan',
    specifications: {
      engine: '6.75L V12',
      horsepower: 563,
      torque: '664 lb-ft',
      transmission: '8-speed automatic',
      drivetrain: 'AWD',
    },
  },
  {
    id: '2',
    name: 'Ghost',
    model: 'Ghost Extended',
    year: 2024,
    price: 350000,
    image: '/images/ghost.jpg',
    description: 'Effortless elegance',
    specifications: {
      engine: '6.75L V12',
      horsepower: 563,
      torque: '627 lb-ft',
      transmission: '8-speed automatic',
      drivetrain: 'AWD',
    },
  },
  {
    id: '3',
    name: 'Cullinan',
    model: 'Cullinan Black Badge',
    year: 2024,
    price: 400000,
    image: '/images/cullinan.jpg',
    description: 'The ultimate luxury SUV',
    specifications: {
      engine: '6.75L V12',
      horsepower: 600,
      torque: '664 lb-ft',
      transmission: '8-speed automatic',
      drivetrain: 'AWD',
    },
  },
];

const renderWithProvider = (props = {}) => {
  return render(
    <VehicleProvider>
      <VehicleList {...props} />
    </VehicleProvider>
  );
};

describe('VehicleList Accessibility Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('WCAG 2.1 AA Compliance', () => {
    it('should have no accessibility violations when loading', async () => {
      const { container } = renderWithProvider({ isLoading: true });
      
      const results = await axe(container, {
        rules: {
          'color-contrast': { enabled: true },
          'keyboard': { enabled: true },
          'aria-allowed-attr': { enabled: true },
          'aria-required-attr': { enabled: true },
          'aria-valid-attr-value': { enabled: true },
          'label': { enabled: true },
          'landmark-one-main': { enabled: true },
          'region': { enabled: true },
        },
      });
      
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations when displaying error', async () => {
      const { container } = renderWithProvider({ 
        error: 'Failed to load vehicles. Please try again.' 
      });
      
      const results = await axe(container, {
        rules: {
          'color-contrast': { enabled: true },
          'aria-alert': { enabled: true },
          'role': { enabled: true },
        },
      });
      
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations when empty', async () => {
      const { container } = renderWithProvider({ 
        vehicles: [], 
        isLoading: false 
      });
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations when populated with vehicles', async () => {
      const { container } = renderWithProvider({ 
        vehicles: mockVehicles, 
        isLoading: false 
      });
      
      const results = await axe(container, {
        rules: {
          'color-contrast': { enabled: true },
          'image-alt': { enabled: true },
          'button-name': { enabled: true },
          'link-name': { enabled: true },
          'heading-order': { enabled: true },
          'list': { enabled: true },
          'listitem': { enabled: true },
        },
      });
      
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations with filter and sort controls', async () => {
      const { container } = renderWithProvider({ 
        vehicles: mockVehicles, 
        isLoading: false,
        showFilters: true,
        showSort: true,
      });
      
      const results = await axe(container, {
        rules: {
          'color-contrast': { enabled: true },
          'select-name': { enabled: true },
          'label': { enabled: true },
          'button-name': { enabled: true },
        },
      });
      
      expect(results).toHaveNoViolations();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should allow keyboard navigation through vehicle cards', async () => {
      renderWithProvider({ vehicles: mockVehicles, isLoading: false });
      
      const firstCard = screen.getByRole('article', { name: /Phantom/i });
      expect(firstCard).toBeInTheDocument();
      
      firstCard.focus();
      expect(firstCard).toHaveFocus();
      
      fireEvent.keyDown(firstCard, { key: 'Tab' });
      
      const secondCard = screen.getByRole('article', { name: /Ghost/i });
      await waitFor(() => {
        expect(secondCard).toHaveFocus();
      });
    });

    it('should activate vehicle card on Enter key', async () => {
      const onVehicleSelect = vi.fn();
      renderWithProvider({ 
        vehicles: mockVehicles, 
        isLoading: false,
        onVehicleSelect,
      });
      
      const firstCard = screen.getByRole('article', { name: /Phantom/i });
      firstCard.focus();
      
      fireEvent.keyDown(firstCard, { key: 'Enter' });
      
      await waitFor(() => {
        expect(onVehicleSelect).toHaveBeenCalledWith(mockVehicles[0]);
      });
    });

    it('should activate vehicle card on Space key', async () => {
      const onVehicleSelect = vi.fn();
      renderWithProvider({ 
        vehicles: mockVehicles, 
        isLoading: false,
        onVehicleSelect,
      });
      
      const firstCard = screen.getByRole('article', { name: /Phantom/i });
      firstCard.focus();
      
      fireEvent.keyDown(firstCard, { key: ' ' });
      
      await waitFor(() => {
        expect(onVehicleSelect).toHaveBeenCalledWith(mockVehicles[0]);
      });
    });

    it('should navigate filter controls with arrow keys', async () => {
      renderWithProvider({ 
        vehicles: mockVehicles, 
        isLoading: false,
        showFilters: true,
      });
      
      const filterSelect = screen.getByRole('combobox', { name: /filter by model/i });
      filterSelect.focus();
      
      fireEvent.keyDown(filterSelect, { key: 'ArrowDown' });
      fireEvent.keyDown(filterSelect, { key: 'ArrowDown' });
      fireEvent.keyDown(filterSelect, { key: 'Enter' });
      
      await waitFor(() => {
        expect(filterSelect).toHaveFocus();
      });
    });

    it('should trap focus in modal when vehicle details opened', async () => {
      const onVehicleSelect = vi.fn();
      renderWithProvider({ 
        vehicles: mockVehicles, 
        isLoading: false,
        onVehicleSelect,
      });
      
      const firstCard = screen.getByRole('article', { name: /Phantom/i });
      fireEvent.click(firstCard);
      
      await waitFor(() => {
        const modal = screen.getByRole('dialog', { name: /Phantom details/i });
        expect(modal).toBeInTheDocument();
        
        const closeButton = screen.getByRole('button', { name: /close/i });
        expect(closeButton).toHaveFocus();
      });
    });

    it('should return focus to triggering element when modal closes', async () => {
      const onVehicleSelect = vi.fn();
      renderWithProvider({ 
        vehicles: mockVehicles, 
        isLoading: false,
        onVehicleSelect,
      });
      
      const firstCard = screen.getByRole('article', { name: /Phantom/i });
      fireEvent.click(firstCard);
      
      await waitFor(() => {
        const closeButton = screen.getByRole('button', { name: /close/i });
        fireEvent.click(closeButton);
      });
      
      await waitFor(() => {
        expect(firstCard).toHaveFocus();
      });
    });
  });

  describe('ARIA Labels and Roles', () => {
    it('should have proper landmark regions', async () => {
      renderWithProvider({ vehicles: mockVehicles, isLoading: false });
      
      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
      
      const vehicleList = screen.getByRole('list', { name: /available vehicles/i });
      expect(vehicleList).toBeInTheDocument();
    });

    it('should have proper heading hierarchy', async () => {
      renderWithProvider({ vehicles: mockVehicles, isLoading: false });
      
      const h1 = screen.getByRole('heading', { level: 1, name: /our vehicles/i });
      expect(h1).toBeInTheDocument();
      
      const vehicleHeadings = screen.getAllByRole('heading', { level: 2 });
      expect(vehicleHeadings).toHaveLength(3);
      
      vehicleHeadings.forEach((heading, index) => {
        expect(heading).toHaveTextContent(mockVehicles[index].name);
      });
    });

    it('should have descriptive ARIA labels on interactive elements', async () => {
      renderWithProvider({ 
        vehicles: mockVehicles, 
        isLoading: false,
        showFilters: true,
        showSort: true,
      });
      
      const filterSelect = screen.getByRole('combobox', { name: /filter by model/i });
      expect(filterSelect).toHaveAttribute('aria-label', 'Filter by model');
      
      const sortSelect = screen.getByRole('combobox', { name: /sort by/i });
      expect(sortSelect).toHaveAttribute('aria-label', 'Sort by');
      
      const viewToggle = screen.getByRole('button', { name: /toggle view/i });
      expect(viewToggle).toHaveAttribute('aria-label', 'Toggle grid/list view');
      expect(viewToggle).toHaveAttribute('aria-pressed');
    });

    it('should announce loading state to screen readers', async () => {
      renderWithProvider({ isLoading: true });
      
      const loadingRegion = screen.getByRole('status', { name: /loading vehicles/i });
      expect(loadingRegion).toBeInTheDocument();
      expect(loadingRegion).toHaveAttribute('aria-live', 'polite');
      expect(loadingRegion).toHaveAttribute('aria-busy', 'true');
    });

    it('should announce error state to screen readers', async () => {
      renderWithProvider({ 
        error: 'Network error occurred', 
        isLoading: false 
      });
      
      const errorAlert = screen.getByRole('alert', { name: /error loading vehicles/i });
      expect(errorAlert).toBeInTheDocument();
      expect(errorAlert).toHaveAttribute('aria-live', 'assertive');
      expect(errorAlert).toHaveTextContent(/network error occurred/i);
    });

    it('should have proper ARIA attributes on vehicle cards', async () => {
      renderWithProvider({ vehicles: mockVehicles, isLoading: false });
      
      const firstCard = screen.getByRole('article', { name: /Phantom/i });
      expect(firstCard).toHaveAttribute('tabindex', '0');
      expect(firstCard).toHaveAttribute('role', 'article');
      expect(firstCard).toHaveAttribute('aria-labelledby');
      
      const cardHeading = screen.getByRole('heading', { level: 2, name: /Phantom/i });
      expect(firstCard.getAttribute('aria-labelledby')).toBe(cardHeading.id);
    });

    it('should have proper image alt text', async () => {
      renderWithProvider({ vehicles: mockVehicles, isLoading: false });
      
      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(3);
      
      images.forEach((img, index) => {
        expect(img).toHaveAttribute('alt', `${mockVehicles[index].name} ${mockVehicles[index].model}`);
      });
    });
  });

  describe('Focus Management', () => {
    it('should have visible focus indicators on all interactive elements', async () => {
      renderWithProvider({ 
        vehicles: mockVehicles, 
        isLoading: false,
        showFilters: true,
      });
      
      const interactiveElements = [
        screen.getByRole('article', { name: /Phantom/i }),
        screen.getByRole('combobox', { name: /filter by model/i }),
        screen.getByRole('button', { name: /toggle view/i }),
      ];
      
      for (const element of interactiveElements) {
        element.focus();
        expect(element).toHaveFocus();
        expect(element).toHaveStyleRule('outline', 'none', { modifier: '&:focus-visible' });
        expect(element).toHaveStyleRule('box-shadow', /0 0 0 3px/, { modifier: '&:focus-visible' });
      }
    });

    it('should manage focus when filtering results', async () => {
      renderWithProvider({ 
        vehicles: mockVehicles, 
        isLoading: false,
        showFilters: true,
      });
      
      const filterSelect = screen.getByRole('combobox', { name: /filter by model/i });
      filterSelect.focus();
      
      fireEvent.change(filterSelect, { target: { value: 'Ghost' } });
      
      await waitFor(() => {
        const ghostCard = screen.getByRole('article', { name: /Ghost/i });
        expect(ghostCard).toBeInTheDocument();
      });
      
      expect(filterSelect).toHaveFocus();
    });

    it('should manage focus when sorting results', async () => {
      renderWithProvider({ 
        vehicles: mockVehicles, 
        isLoading: false,
        showSort: true,
      });
      
      const sortSelect = screen.getByRole('combobox', { name: /sort by/i });
      sortSelect.focus();
      
      fireEvent.change(sortSelect, { target: { value: 'price-asc' } });
      
      await waitFor(() => {
        const firstCard = screen.getByRole('article', { name: /Ghost/i });
        expect(firstCard).toBeInTheDocument();
      });
      
      expect(sortSelect).toHaveFocus();
    });

    it('should skip to main content link', async () => {
      renderWithProvider({ vehicles: mockVehicles, isLoading: false });
      
      const skipLink = screen.getByRole('link', { name: /skip to main content/i });
      expect(skipLink).toBeInTheDocument();
      
      skipLink.focus();
      fireEvent.keyDown(skipLink, { key: 'Enter' });
      
      const main = screen.getByRole('main');
      await waitFor(() => {
        expect(main).toHaveFocus();
      });
    });
  });

  describe('Color Contrast', () => {
    it('should meet WCAG AA contrast ratio for text', async () => {
      renderWithProvider({ vehicles: mockVehicles, isLoading: false });
      
      const results = await axe(document.body, {
        rules: {
          'color-contrast': { enabled: true },
        },
      });
      
      expect(results).toHaveNoViolations();
    });

    it('should meet WCAG AA contrast ratio for UI components', async () => {
      renderWithProvider({ 
        vehicles: mockVehicles, 
        isLoading: false,
        showFilters: true,
      });
      
      const results = await axe(document.body, {
        rules: {
          'color-contrast': { enabled: true },
          'focus-visible': { enabled: true },
        },
      });
      
      expect(results).toHaveNoViolations();
    });

    it('should meet WCAG AA contrast ratio in error state', async () => {
      renderWithProvider({ 
        error: 'Failed to load', 
        isLoading: false 
      });
      
      const results = await axe(document.body, {
        rules: {
          'color-contrast': { enabled: true },
        },
      });
      
      expect(results).toHaveNoViolations();
    });

    it('should meet WCAG AA contrast ratio in loading state', async () => {
      renderWithProvider({ isLoading: true });
      
      const results = await axe(document.body, {
        rules: {
          'color-contrast': { enabled: true },
        },
      });
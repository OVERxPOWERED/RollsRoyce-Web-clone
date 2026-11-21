The user wants me to create a production smoke test suite for a Rolls-Royce project. Let me analyze the requirements:

1. Create a Vitest test file at `Rolls-Royce/src/__tests__/production-smoke.test.ts`
2. Test scenarios:
   - Vehicle list loads within 200ms (p95)
   - Vehicle detail fetches within 150ms
   - Cache hit rate > 80% after warmup
   - Bundle size < 500KB gzipped
   - No console errors on initial load
3. Use PerformanceProfiler to assert timing budgets
4. Import from @testing-library/react, @tanstack/react-query, and useVehicles hook
5. Add test:verify:smoke script to package.json
6. Use MSW handlers from existing integration tests
7. Remove artificial setTimeout delays in MSW handlers

I need to check what files exist in the codebase first to understand the structure and imports. Let me look at the project structure.

</think>
The user wants me to create a production smoke test suite for a Rolls-Royce project. Let me analyze the requirements:

1. Create a Vitest test file at `Rolls-Royce/src/__tests__/production-smoke.test.ts`
2. Test scenarios:
   - Vehicle list loads within 200ms (p95)
   - Vehicle detail fetches within 150ms
   - Cache hit rate > 80% after warmup
   - Bundle size < 500KB gzipped
   - No console errors on initial load
3. Use PerformanceProfiler to assert timing budgets
4. Import from @testing-library/react, @tanstack/react-query, and useVehicles hook
5. Add test:verify:smoke script to package.json
6. Use MSW handlers from existing integration tests
7. Remove artificial setTimeout delays in MSW handlers

I need to check what files exist in the codebase first to understand the structure and imports. Let me look at the project structure.
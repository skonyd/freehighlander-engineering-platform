#!/usr/bin/env node

import {
  buildParallelBenchmarkReport,
  representativeParallelBenchmarkFixtures,
} from '../../packages/orchestration/dist/index.js';

const report = buildParallelBenchmarkReport(representativeParallelBenchmarkFixtures());
process.stdout.write(JSON.stringify(report, null, 2) + '\n');

#!/usr/bin/env node

import { parseFhResumeArgs, runFhResume } from './project/lib/fh-resume-command.mjs';

try {
  const parsed = parseFhResumeArgs(process.argv.slice(2));
  const result = runFhResume({ parsed });

  if (result.bootstrap !== null) {
    console.log(
      `bootstrap=${result.bootstrap.status} repository=${result.bootstrap.repository} root=${result.repositoryRoot}`,
    );
  }
  if (result.doctor.stdout.trim()) process.stdout.write(result.doctor.stdout);
  if (result.doctor.stderr.trim()) process.stderr.write(result.doctor.stderr);
  if (result.resume.stdout.trim()) process.stdout.write(result.resume.stdout);
  if (result.resume.stderr.trim()) process.stderr.write(result.resume.stderr);

  console.log(`fh_resume=${result.status}`);

  if (result.status === 'FAILED') {
    process.exitCode = 1;
  } else if (result.status === 'INSPECTED_WITH_BLOCKERS') {
    process.exitCode = 2;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FreeHighlander fh FAIL: ${message}`);
  process.exitCode = 1;
}

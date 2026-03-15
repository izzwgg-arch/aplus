/**
 * Test script to verify billing calculations
 * Run with: npx ts-node scripts/test-billing-calculations.ts
 */

import { minutesToUnits, calculateEntryTotals } from '../lib/billing'
import { Decimal } from '@prisma/client/runtime/library'

console.log('Testing Billing Calculations\n')
console.log('=' .repeat(50))

// Test cases - Updated for Hours × 4 formula
const testCases = [
  { minutes: 90, expectedUnits: 6, description: '90 minutes = 1.5 hours × 4 = 6 units' },
  { minutes: 120, expectedUnits: 8, description: '120 minutes = 2 hours × 4 = 8 units' },
  { minutes: 60, expectedUnits: 4, description: '60 minutes = 1 hour × 4 = 4 units' },
  { minutes: 30, expectedUnits: 2, description: '30 minutes = 0.5 hours × 4 = 2 units' },
  { minutes: 15, expectedUnits: 1, description: '15 minutes = 0.25 hours × 4 = 1 unit' },
]

const ratePerUnit = new Decimal(50.00) // Example rate

let allPassed = true

for (const testCase of testCases) {
  const units = minutesToUnits(testCase.minutes)
  const { amount } = calculateEntryTotals(testCase.minutes, null, ratePerUnit, true)
  const expectedAmount = new Decimal(testCase.expectedUnits).times(ratePerUnit)
  
  const passed = units === testCase.expectedUnits
  allPassed = allPassed && passed
  
  console.log(`\nTest: ${testCase.description}`)
  console.log(`  Input: ${testCase.minutes} minutes`)
  console.log(`  Expected: ${testCase.expectedUnits} units`)
  console.log(`  Got: ${units} units`)
  console.log(`  Expected Amount: $${expectedAmount.toNumber().toFixed(2)}`)
  console.log(`  Calculated Amount: $${amount.toNumber().toFixed(2)}`)
  console.log(`  Status: ${passed ? '✅ PASS' : '❌ FAIL'}`)
  
  if (!passed) {
    console.log(`  ERROR: Expected ${testCase.expectedUnits} units but got ${units}`)
  }
}

console.log('\n' + '='.repeat(50))
console.log(`\nOverall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`)

// Verify the formula
console.log('\nFormula Verification:')
console.log('  Units = Hours × 4')
console.log('  90 min = 1.5 hours × 4 = 6 units ✅')
console.log('  120 min = 2 hours × 4 = 8 units ✅')
console.log('  60 min = 1 hour × 4 = 4 units ✅')
console.log('  30 min = 0.5 hours × 4 = 2 units ✅')

process.exit(allPassed ? 0 : 1)

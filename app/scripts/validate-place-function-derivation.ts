import { derivePlaceFunctionAssertions } from '../lib/place-functions';
import type { AlmanakkenPlantationObservation } from '../lib/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function observation(
  recordId: string,
  year: number,
  values: Pick<AlmanakkenPlantationObservation, 'product' | 'function'>,
): AlmanakkenPlantationObservation {
  return {
    recordId,
    source: 'almanakken',
    sourceVersion: 'v2',
    qid: 'Q-test',
    year,
    ...values,
  };
}

const observations = [
  observation('row-1824', 1824, { product: 'Koffie', function: 'Koffie' }),
  observation('row-1825', 1825, { product: 'Koffie', function: 'Koffie' }),
  observation('row-1829', 1829, { product: 'Koffie', function: 'Koffie' }),
  observation('row-1830', 1830, { function: 'Onbekend' }),
];
const assertions = derivePlaceFunctionAssertions({
  almanakkenObservations: observations,
  productAssertions: [
    {
      id: 'production-1824',
      value: 'Koffie',
      source: 'almanakken',
      startYear: 1824,
      endYear: 1825,
    },
  ],
});

assert(assertions.length === 2, 'Function gaps or duplicate evidence were not preserved');
const merged = assertions.find(
  (assertion) => assertion.startYear === 1824 && assertion.endYear === 1825,
);
assert(merged, 'Matching product and function evidence was not merged');
assert(
  merged.evidenceKinds.join(',') === 'production,recorded-function',
  'Merged assertion does not retain both evidence kinds',
);
assert(
  merged.sourceRows.join(',') === 'row-1824,row-1825',
  'Merged assertion does not retain exact source rows',
);
assert(merged.certainty === 'probable', 'Almanakken projection is not probable');
assert(
  assertions.some(
    (assertion) =>
      assertion.startYear === 1829 &&
      assertion.endYear == null &&
      assertion.evidenceKinds.join(',') === 'recorded-function' &&
      assertion.sourceRows.join(',') === 'row-1829',
  ),
  'A gap in source years did not produce a separate recorded-function assertion',
);
assert(
  assertions.every((assertion) => assertion.functionId !== 'onbekend'),
  'A non-function source value was published as a function',
);

let rejectedUnmappedTerm = false;
try {
  derivePlaceFunctionAssertions({
    productAssertions: [{ value: 'Unreviewed future term', source: 'test' }],
  });
} catch (error) {
  rejectedUnmappedTerm =
    error instanceof Error && error.message.includes('Unreviewed place-function');
}
assert(rejectedUnmappedTerm, 'Unmapped function terms are not rejected');

let rejectedCertainty = false;
try {
  derivePlaceFunctionAssertions({
    productAssertions: [
      { value: 'Koffie', source: 'test', certainty: 'definitely' },
    ],
  });
} catch (error) {
  rejectedCertainty =
    error instanceof Error && error.message.includes('Unsupported place-function certainty');
}
assert(rejectedCertainty, 'Uncontrolled function certainty is not rejected');

const distinctEditorialAssertions = derivePlaceFunctionAssertions({
  productAssertions: [
    {
      id: 'editorial-a',
      value: 'Koffie',
      source: 'test',
      startYear: 1900,
      note: 'First editorial assertion',
    },
    {
      id: 'editorial-b',
      value: 'Koffie',
      source: 'test',
      startYear: 1900,
      note: 'Second editorial assertion',
    },
  ],
});
assert(
  distinctEditorialAssertions.length === 2,
  'Distinct same-kind editorial assertions were incorrectly merged',
);

console.log('Place-function derivation regression checks OK.');

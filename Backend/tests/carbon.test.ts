/**
 * Unit Tests for Carbon Footprint Utilities
 */

import {
  CARBON_FACTORS,
  calculateFlightCarbon,
  calculateTrainCarbon,
  calculateBusCarbon,
  calculateCarCarbon,
  getComparison,
  calculateOffsetCost,
  formatCarbon,
  getSustainabilityRating,
  calculateTypicalTouristCarbon,
} from '../utils/carbon';

describe('CARBON_FACTORS', () => {
  it('should have non-negative values for all factors', () => {
    for (const [key, value] of Object.entries(CARBON_FACTORS)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('should order flight tiers by distance (short > medium > long)', () => {
    expect(CARBON_FACTORS.FLIGHT_SHORT).toBeGreaterThan(CARBON_FACTORS.FLIGHT_MEDIUM);
    expect(CARBON_FACTORS.FLIGHT_MEDIUM).toBeGreaterThan(CARBON_FACTORS.FLIGHT_LONG);
  });

  it('should have zero emissions for bicycle and walking', () => {
    expect(CARBON_FACTORS.BICYCLE).toBe(0);
    expect(CARBON_FACTORS.WALKING).toBe(0);
  });
});

describe('calculateFlightCarbon', () => {
  it('should use short-haul factor for flights under 500 km', () => {
    const result = calculateFlightCarbon(300);
    expect(result).toBeCloseTo(300 * CARBON_FACTORS.FLIGHT_SHORT, 2);
  });

  it('should use medium-haul factor for flights between 500 and 3700 km', () => {
    const result = calculateFlightCarbon(1000);
    expect(result).toBeCloseTo(1000 * CARBON_FACTORS.FLIGHT_MEDIUM, 2);
  });

  it('should use long-haul factor for flights over 3700 km', () => {
    const result = calculateFlightCarbon(10000);
    expect(result).toBeCloseTo(10000 * CARBON_FACTORS.FLIGHT_LONG, 2);
  });

  it('should return 0 for 0 km', () => {
    expect(calculateFlightCarbon(0)).toBe(0);
  });

  it('should use short-haul at exactly 499 km', () => {
    const result = calculateFlightCarbon(499);
    expect(result).toBeCloseTo(499 * CARBON_FACTORS.FLIGHT_SHORT, 2);
  });

  it('should use medium-haul at exactly 500 km', () => {
    const result = calculateFlightCarbon(500);
    expect(result).toBeCloseTo(500 * CARBON_FACTORS.FLIGHT_MEDIUM, 2);
  });

  it('should round to 2 decimal places', () => {
    const result = calculateFlightCarbon(300);
    expect(result).toBe(Math.round(300 * CARBON_FACTORS.FLIGHT_SHORT * 100) / 100);
  });
});

describe('calculateTrainCarbon', () => {
  it('should use electric factor by default', () => {
    const result = calculateTrainCarbon(100);
    expect(result).toBeCloseTo(100 * CARBON_FACTORS.TRAIN_ELECTRIC, 2);
  });

  it('should use electric factor when isElectric is true', () => {
    const result = calculateTrainCarbon(100, true);
    expect(result).toBeCloseTo(100 * CARBON_FACTORS.TRAIN_ELECTRIC, 2);
  });

  it('should use diesel factor when isElectric is false', () => {
    const result = calculateTrainCarbon(100, false);
    expect(result).toBeCloseTo(100 * CARBON_FACTORS.TRAIN_DIESEL, 2);
  });

  it('electric train should emit less than diesel for same distance', () => {
    expect(calculateTrainCarbon(100, true)).toBeLessThan(calculateTrainCarbon(100, false));
  });
});

describe('calculateBusCarbon', () => {
  it('should use urban factor by default', () => {
    const result = calculateBusCarbon(100);
    expect(result).toBeCloseTo(100 * CARBON_FACTORS.BUS_URBAN, 2);
  });

  it('should use coach factor when isCoach is true', () => {
    const result = calculateBusCarbon(100, true);
    expect(result).toBeCloseTo(100 * CARBON_FACTORS.BUS_COACH, 2);
  });

  it('coach should emit less than urban bus for same distance', () => {
    expect(calculateBusCarbon(100, true)).toBeLessThan(calculateBusCarbon(100, false));
  });
});

describe('calculateCarCarbon', () => {
  it('should use average car factor for 1 passenger by default', () => {
    const result = calculateCarCarbon(100);
    expect(result).toBeCloseTo(100 * CARBON_FACTORS.CAR_AVERAGE, 2);
  });

  it('should divide emissions by number of passengers', () => {
    const solo = calculateCarCarbon(100, 1);
    const shared = calculateCarCarbon(100, 2);
    expect(shared).toBeCloseTo(solo / 2, 2);
  });

  it('should use electric factor when isElectric is true', () => {
    const result = calculateCarCarbon(100, 1, true);
    expect(result).toBeCloseTo(100 * CARBON_FACTORS.CAR_ELECTRIC, 2);
  });

  it('electric car should emit less than regular car', () => {
    expect(calculateCarCarbon(100, 1, true)).toBeLessThan(calculateCarCarbon(100, 1, false));
  });

  it('electric car with 2 passengers should halve emissions per person', () => {
    const elec1 = calculateCarCarbon(100, 1, true);
    const elec2 = calculateCarCarbon(100, 2, true);
    expect(elec2).toBeCloseTo(elec1 / 2, 2);
  });
});

describe('getComparison', () => {
  it('should return higher vsFlying percentage for low-carbon options', () => {
    const { vsFlying } = getComparison(5, 500);
    expect(vsFlying).toBeGreaterThan(0);
  });

  it('should return 100% savings when carbon is 0 (e.g. cycling)', () => {
    const { vsFlying, vsDriving } = getComparison(0, 500);
    expect(vsFlying).toBe(100);
    expect(vsDriving).toBe(100);
  });

  it('should return 0% savings when mode matches the baseline', () => {
    const flightCarbon = calculateFlightCarbon(500);
    const { vsFlying } = getComparison(flightCarbon, 500);
    expect(vsFlying).toBe(0);
  });

  it('should return negative percentage when carbon exceeds flying', () => {
    // Something that emits more than a flight
    const { vsFlying } = getComparison(9999, 500);
    expect(vsFlying).toBeLessThan(0);
  });

  it('should return 0 vsFlying for 0 km distance (no division by zero)', () => {
    const { vsFlying } = getComparison(0, 0);
    expect(vsFlying).toBe(0);
  });
});

describe('calculateOffsetCost', () => {
  it('should return 0 for 0 kg', () => {
    expect(calculateOffsetCost(0)).toBe(0);
  });

  it('should return $0.02 for 1 kg CO2 ($15/ton rounds up from $0.015)', () => {
    expect(calculateOffsetCost(1)).toBeCloseTo(0.02, 2);
  });

  it('should return $15 for 1000 kg CO2 (1 ton)', () => {
    expect(calculateOffsetCost(1000)).toBeCloseTo(15, 2);
  });

  it('should scale linearly', () => {
    expect(calculateOffsetCost(2000)).toBeCloseTo(calculateOffsetCost(1000) * 2, 2);
  });
});

describe('formatCarbon', () => {
  it('should format values under 1000 kg as kg', () => {
    expect(formatCarbon(500)).toBe('500.0 kg CO₂');
  });

  it('should format values of 1000 kg or more as tons', () => {
    expect(formatCarbon(1000)).toBe('1.0 tons CO₂');
  });

  it('should format 1500 kg as 1.5 tons', () => {
    expect(formatCarbon(1500)).toBe('1.5 tons CO₂');
  });

  it('should format 0 kg correctly', () => {
    expect(formatCarbon(0)).toBe('0.0 kg CO₂');
  });

  it('should format 999.9 kg as kg not tons', () => {
    expect(formatCarbon(999.9)).toContain('kg CO₂');
    expect(formatCarbon(999.9)).not.toContain('tons');
  });
});

describe('getSustainabilityRating', () => {
  it('should rate 0 carbon/km as Excellent', () => {
    const { rating, score } = getSustainabilityRating(0);
    expect(rating).toBe('Excellent');
    expect(score).toBe(5);
  });

  it('should rate subway (0.029) as Excellent', () => {
    const { rating } = getSustainabilityRating(CARBON_FACTORS.SUBWAY);
    expect(rating).toBe('Excellent');
  });

  it('should rate 0.04 as Great', () => {
    const { rating, score } = getSustainabilityRating(0.04);
    expect(rating).toBe('Great');
    expect(score).toBe(4);
  });

  it('should rate 0.08 as Good', () => {
    const { rating, score } = getSustainabilityRating(0.08);
    expect(rating).toBe('Good');
    expect(score).toBe(3);
  });

  it('should rate 0.15 as Fair', () => {
    const { rating, score } = getSustainabilityRating(0.15);
    expect(rating).toBe('Fair');
    expect(score).toBe(2);
  });

  it('should rate 0.21 (average car) as Poor', () => {
    const { rating, score } = getSustainabilityRating(CARBON_FACTORS.CAR_AVERAGE);
    expect(rating).toBe('Poor');
    expect(score).toBe(1);
  });

  it('should return a hex color for every tier', () => {
    const carbonValues = [0, 0.04, 0.08, 0.15, 0.25];
    for (const v of carbonValues) {
      const { color } = getSustainabilityRating(v);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('calculateTypicalTouristCarbon', () => {
  it('should combine flight carbon and local car travel', () => {
    const distance = 1000;
    const days = 5;
    const expected =
      Math.round(
        (calculateFlightCarbon(distance) + days * 50 * CARBON_FACTORS.CAR_AVERAGE) * 100
      ) / 100;
    expect(calculateTypicalTouristCarbon(distance, days)).toBeCloseTo(expected, 2);
  });

  it('should increase with more trip days', () => {
    const short = calculateTypicalTouristCarbon(1000, 3);
    const long = calculateTypicalTouristCarbon(1000, 10);
    expect(long).toBeGreaterThan(short);
  });

  it('should increase with longer distances', () => {
    const near = calculateTypicalTouristCarbon(500, 5);
    const far = calculateTypicalTouristCarbon(5000, 5);
    expect(far).toBeGreaterThan(near);
  });
});

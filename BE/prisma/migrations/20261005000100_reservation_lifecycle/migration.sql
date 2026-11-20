-- Extend the existing reservation lifecycle without changing historical rows.
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

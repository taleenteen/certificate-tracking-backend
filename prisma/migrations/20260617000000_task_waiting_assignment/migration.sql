-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'WAITING_ASSIGNMENT';

-- AlterTable: make assigned_to nullable
ALTER TABLE "inspection_tasks" ALTER COLUMN "assigned_to" DROP NOT NULL;

-- CreateEnum
CREATE TYPE "PublicationMode" AS ENUM ('USER', 'COMMUNITY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PostStatus" ADD VALUE 'PENDING';
ALTER TYPE "PostStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "publicationMode" "PublicationMode" NOT NULL DEFAULT 'USER';

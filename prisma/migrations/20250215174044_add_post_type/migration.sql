-- CreateEnum
CREATE TYPE "PublicationType" AS ENUM ('ARTICLE', 'NEWS', 'REVIEW');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "publicationType" "PublicationType" NOT NULL DEFAULT 'ARTICLE';

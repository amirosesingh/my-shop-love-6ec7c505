/* =====================================================================
   Lucky Charms POS — offline database for Microsoft SQL Server
   ---------------------------------------------------------------------
   Run this once on the till PC (SQL Server 2019+ or SQL Server Express).

     sqlcmd -S localhost\SQLEXPRESS -E -i pos-offline-sqlserver.sql

   or open it in SQL Server Management Studio and press Execute.

   It creates the POS_LOCAL database, a dedicated login, every offline
   table with its sync bookkeeping columns, and the indexes the till uses.
   The script is idempotent: running it again changes nothing, so it is
   also the upgrade path for a till installed with an older build.

   This file is kept in step with the schema the Windows shell applies on
   start-up, so a till set up by hand and a till set up by the app end up
   with exactly the same database.

   After it finishes, open the POS and go to
   System & Settings -> Local Database, then enter:
     Server    localhost\SQLEXPRESS   (or your instance)
     Database  POS_LOCAL
     User      pos_local
     Password  the password set below (change it first!)
   Press "Test connection" — the settings are sealed on the machine, so
   nobody can read them back afterwards.
   ===================================================================== */

SET NOCOUNT ON;
GO

IF DB_ID('POS_LOCAL') IS NULL
  CREATE DATABASE POS_LOCAL;
GO

USE POS_LOCAL;
GO

/* ---- dedicated login (change the password before running) ---- */
DECLARE @pwd NVARCHAR(128) = N'ChangeMe_Str0ng!';
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'pos_local')
  EXEC('CREATE LOGIN pos_local WITH PASSWORD = ''' + @pwd + ''', CHECK_POLICY = ON');
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'pos_local')
  CREATE USER pos_local FOR LOGIN pos_local;
GO
ALTER ROLE db_datareader ADD MEMBER pos_local;
ALTER ROLE db_datawriter ADD MEMBER pos_local;
GO

/* ---- tables (identical to the shape the till syncs to the cloud) ---- */

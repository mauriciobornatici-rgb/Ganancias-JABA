-- Justificacion profesional del resultado atribuido manual en participaciones societarias.
ALTER TABLE `SocietyParticipation`
  ADD COLUMN `overrideReason` TEXT NULL;

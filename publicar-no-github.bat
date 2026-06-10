@echo off
set GIT_HOME=C:\Users\jedso\Documents\Codex\PortableGit-2.54.0
set PATH=%GIT_HOME%\cmd;%GIT_HOME%\mingw64\bin;%PATH%
set GIT_EXE=%GIT_HOME%\cmd\git.exe
set GIT_DIR=C:\Users\jedso\Documents\Codex\2026-05-28\gostaria-de-analisar-meu-app-que\app-imobiliaria.git
set WORK_TREE=C:\Users\jedso\App Imobiliaria
"%GIT_EXE%" --git-dir="%GIT_DIR%" --work-tree="%WORK_TREE%" push origin main
pause

#!/bin/sh
# Garantir que o usuário agent tenha permissão no volume /workspace
chown -R agent:agent /workspace
# Marcar /workspace como safe directory para git (evita erro de dubious ownership)
git config --system --add safe.directory '*'
exec su-exec agent node /app/server.js

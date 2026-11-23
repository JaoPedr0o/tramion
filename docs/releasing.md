# Publicando uma versão

O Tramion publica versões como **GitHub Releases**. O caminho normal é automático: criar uma tag faz o GitHub
compilar os instaladores e montar um rascunho de release.

## Uma vez só: colocar o código no GitHub

1. No GitHub, crie um repositório **vazio** (sem README, `.gitignore` nem licença).
2. No projeto:

   ```bash
   git remote add origin https://github.com/JaoPedr0o/tramion.git
   git push -u origin main
   ```

3. Confira a aba **Actions**: o fluxo **CI** roda `pnpm check` em cada envio.

## A cada versão

1. **Atualize a versão** (mantenha os três iguais) e o `CHANGELOG.md`:
   - `apps/desktop/src-tauri/tauri.conf.json` → `version`
   - `apps/desktop/src-tauri/Cargo.toml` → `version`
   - `package.json` (raiz) → `version`
2. `pnpm check` precisa passar. Faça o commit.
3. **Crie e envie a tag** (precisa começar com `v`):

   ```bash
   git tag -a v0.1.0 -m "Tramion 0.1.0"
   git push origin v0.1.0
   ```

4. O fluxo **Release** (aba Actions) compila Linux, Windows e macOS, e cria um **rascunho** em
   _Releases_ com os instaladores anexados. Leva de 10 a 25 minutos.
5. Abra o rascunho, revise o texto, e clique em **Publish release**.

> Se uma plataforma falhar (Windows e macOS ainda não foram validados), a de Linux continua e o rascunho sai com o que
> foi gerado. Corrija, apague a tag (`git push --delete origin v0.1.0` e `git tag -d v0.1.0`) e crie de novo.

## Alternativa manual (sem o fluxo automático)

Gere o pacote na sua máquina e anexe você mesmo:

```bash
pnpm --filter @tramion/desktop tauri build --bundles deb
# o arquivo fica em target/release/bundle/deb/Tramion_<versão>_amd64.deb
```

No GitHub: **Releases → Draft a new release → escolha a tag → arraste o `.deb` → Publish release**.

## Sobre os instaladores

- **Não são assinados.** O Windows (SmartScreen) e o macOS (Gatekeeper) avisam que o autor é desconhecido. Assinar exige
  certificado (Windows) e conta de desenvolvedor Apple (macOS); fica para quando fizer sentido.
- Os dados do usuário ficam fora do instalador (veja o README), então atualizar ou desinstalar não apaga nada.

## APK do Android

O APK é gerado e **assinado** pelo fluxo de publicação, se o repositório tiver estes dois segredos
(Settings → Secrets and variables → Actions):

- `ANDROID_KEYSTORE_BASE64`: o arquivo da chave (`tramion-release.jks`) em base64 (`base64 -w0 tramion-release.jks`);
- `ANDROID_KEYSTORE_PASSWORD`: a senha da chave.

Sem eles, o job do Android é pulado e a release sai só com os instaladores do computador.

**Cuidados com a chave de assinatura**

- Ela **nunca** vai para o repositório. Localmente fica em `~/.config/tramion-signing/` (arquivo da chave e senha).
- **Faça uma cópia de segurança** (gerenciador de senhas, pen drive). Quem perde a chave não consegue mais publicar
  atualizações que o Android aceite por cima do app instalado: seria preciso desinstalar e instalar de novo, perdendo
  os dados do celular.
- Para compilar um APK assinado na sua máquina: defina `TRAMION_KEYSTORE` (caminho) e `TRAMION_KEYSTORE_PASSWORD` e
  rode `pnpm tauri android build --apk --target aarch64` em `apps/desktop`.

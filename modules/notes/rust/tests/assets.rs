use aun_notes::assets::{MAX_ASSET_BYTES, store, stored_name};
use aun_notes::error::NotesError;
use tempfile::TempDir;

const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];
const JPG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3];

#[test]
fn nome_guardado_e_o_resumo_do_conteudo_com_a_extensao() {
    let name = stored_name("minha foto (1).PNG", PNG).unwrap();

    assert!(name.ends_with(".png"), "extensão em minúsculas: {name}");
    assert_eq!(name.len(), 32 + ".png".len());
    assert!(
        !name.contains("minha") && !name.contains(' '),
        "o nome original nunca é usado"
    );
    assert_eq!(
        name,
        stored_name("outro-nome.png", PNG).unwrap(),
        "mesmo conteúdo, mesmo nome"
    );
    assert_ne!(name, stored_name("a.png", &[PNG, &[1]].concat()).unwrap());
}

#[test]
fn nome_com_caminho_nao_escapa_da_pasta() {
    let name = stored_name("../../etc/passwd.png", PNG).unwrap();

    assert!(!name.contains('/') && !name.contains(".."));
}

#[test]
fn aceita_imagens_pela_assinatura_e_midia_so_pela_extensao() {
    assert!(stored_name("a.jpg", JPG).is_ok());
    assert!(stored_name("a.jpeg", JPG).is_ok());
    assert!(stored_name("a.gif", b"GIF89a....").is_ok());
    assert!(stored_name("a.webp", b"RIFF\x00\x00\x00\x00WEBPVP8 ").is_ok());
    assert!(stored_name("a.avif", b"\x00\x00\x00\x1cftypavif").is_ok());
    assert!(stored_name("clipe.mp4", b"qualquer coisa").is_ok());
    assert!(stored_name("som.mp3", b"qualquer coisa").is_ok());
}

#[test]
fn recusa_extensao_nao_aceita() {
    for name in [
        "x.svg", "x.html", "x.exe", "x.js", "x.pdf", "x", "x.", ".png.exe", "png",
    ] {
        assert!(
            matches!(stored_name(name, PNG), Err(NotesError::AssetTypeNotAllowed)),
            "deveria recusar {name:?}"
        );
    }
}

#[test]
fn recusa_imagem_cujo_conteudo_nao_bate_com_a_extensao() {
    assert!(matches!(
        stored_name("fake.png", b"<script>alert(1)</script>"),
        Err(NotesError::AssetInvalid)
    ));
    assert!(matches!(
        stored_name("fake.png", JPG),
        Err(NotesError::AssetInvalid)
    ));
    assert!(matches!(
        stored_name("fake.jpg", PNG),
        Err(NotesError::AssetInvalid)
    ));
}

#[test]
fn recusa_arquivo_vazio_e_grande_demais() {
    assert!(matches!(
        stored_name("a.png", b""),
        Err(NotesError::AssetInvalid)
    ));
    let huge = vec![0u8; MAX_ASSET_BYTES + 1];
    assert!(matches!(
        stored_name("a.mp4", &huge),
        Err(NotesError::AssetTooLarge { .. })
    ));
}

#[test]
fn grava_na_pasta_cria_a_pasta_e_nao_regrava_o_mesmo_arquivo() {
    let dir = TempDir::new().unwrap();
    let assets = dir.path().join("ainda").join("nao-existe");

    let first = store(&assets, "a.png", PNG).unwrap();
    assert!(first.starts_with(&assets));
    assert_eq!(std::fs::read(&first).unwrap(), PNG);

    let second = store(&assets, "b.png", PNG).unwrap();
    assert_eq!(first, second, "o mesmo conteúdo reaproveita o arquivo");
    assert_eq!(std::fs::read_dir(&assets).unwrap().count(), 1);
}

#[test]
fn recusado_nao_grava_nada() {
    let dir = TempDir::new().unwrap();

    assert!(store(dir.path(), "fake.png", b"nao e png").is_err());

    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[test]
fn codigos_de_erro_sao_estaveis() {
    assert_eq!(
        NotesError::AssetTooLarge { max: 1 }.code(),
        "notes.asset-too-large"
    );
    assert_eq!(
        NotesError::AssetTypeNotAllowed.code(),
        "notes.asset-type-not-allowed"
    );
    assert_eq!(NotesError::AssetInvalid.code(), "notes.asset-invalid");
}

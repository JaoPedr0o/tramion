#![cfg(desktop)]
use desktop_lib::tray::{QUICK_CAPTURE_EVENT, hide_instead_of_close};

#[test]
fn so_esconde_ao_fechar_quando_a_bandeja_existe() {
    assert!(hide_instead_of_close(true));
    assert!(
        !hide_instead_of_close(false),
        "sem bandeja, fechar a janela fecha o app"
    );
}

#[test]
fn o_evento_da_captura_rapida_tem_um_nome_estavel() {
    assert_eq!(QUICK_CAPTURE_EVENT, "tramion://quick-capture");
}

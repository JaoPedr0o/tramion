use tramion_notes::error::NotesError;
use tramion_notes::external::validate_external_url;

#[test]
fn aceita_http_e_https() {
    for url in [
        "https://exemplo.com",
        "http://exemplo.com/a?b=1#c",
        "HTTPS://EXEMPLO.COM",
        "https://sub.site.com:8080/x",
    ] {
        assert_eq!(validate_external_url(url).unwrap(), url, "{url}");
    }
}

#[test]
fn recusa_outros_esquemas_e_enderecos_malformados() {
    for url in [
        "",
        "exemplo.com",
        "javascript:alert(1)",
        "file:///etc/passwd",
        "data:text/html,<b>x</b>",
        "ftp://exemplo.com",
        "https://",
        "http:///sem-host",
        "//exemplo.com",
        "mailto:a@b.c",
        "https://exe mplo.com",
        "https://exemplo.com\n",
        "https://ex\u{0}emplo.com",
        " https://exemplo.com",
    ] {
        assert!(
            matches!(validate_external_url(url), Err(NotesError::UrlInvalid)),
            "deveria recusar {url:?}"
        );
    }
}

#[test]
fn codigo_de_erro_e_estavel() {
    assert_eq!(NotesError::UrlInvalid.code(), "notes.url-invalid");
}

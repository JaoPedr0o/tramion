/**
 * Eventos do módulo de notas. Ficam aqui (e não no módulo) para que outros módulos possam escutá-los
 * sem importar o módulo de notas, o que é proibido.
 *
 * Os eventos levam SÓ o id: quem precisar dos dados busca a versão atual. Assim ninguém fica com
 * dados velhos e o modelo interno das notas não vaza para os outros módulos.
 *
 * Todos são publicados DEPOIS de a operação ser confirmada; nunca se ela falhar.
 */
export interface NotesEvents {
  /** Uma nota foi criada. */
  "note.created": { readonly id: string };
  /** O título ou o corpo mudou, ou a nota foi fixada/desafixada. */
  "note.updated": { readonly id: string };
  /** A nota foi para a lixeira (reversível). */
  "note.deleted": { readonly id: string };
  /** A nota voltou da lixeira. */
  "note.restored": { readonly id: string };
  /** A nota foi apagada de vez (irreversível). */
  "note.purged": { readonly id: string };
}

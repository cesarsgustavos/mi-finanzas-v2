// src/components/ActualizarUserId.jsx

import { useEffect } from 'react';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../services/firebase';

export default function ActualizarUserId() {
  useEffect(() => {
    const actualizarDocumentos = async (uid) => {
      const colecciones = ['movimientos', 'tarjetas', 'gastosTarjeta', 'pagosMarcados'];

      for (const nombreColeccion of colecciones) {
        const snap = await getDocs(collection(db, nombreColeccion));
        let actualizados = 0;

        for (const documento of snap.docs) {
          const data = documento.data();
          if (!data.userId) {
            await updateDoc(doc(db, nombreColeccion, documento.id), { userId: uid });
            actualizados++;
          }
        }

        console.log(`Colección ${nombreColeccion}: ${actualizados} documentos actualizados.`);
      }

      alert('Actualización finalizada. Revisa la consola para detalles.');
    };

    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user) actualizarDocumentos(user.uid);
      else console.warn('Usuario no autenticado');
    });

    return () => unsubscribe();
  }, []);

  return null;
}

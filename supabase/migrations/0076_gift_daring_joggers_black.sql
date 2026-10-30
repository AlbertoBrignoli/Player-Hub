-- Daring Joggers: versione Nera (pagina "Daring Joggers Nero"), foto ufficiale della stessa pagina; tolta la nota sul colore.
update public.crm_gift_items
   set color = 'Black',
       url = 'https://ciaogym.com/it/daring-joggers-nero-21jg001bn-u-black-1.html',
       image_url = 'https://ciaogym.com/media/catalog/product/cache/88dcd7e56296aac895b998c5c283502e/c/i/ciaogym_4690_1_1.jpg',
       sizes = array['S','M','L','XL','XXL'],
       admin_note = null
 where name = 'Daring Joggers'
   and url = 'https://ciaogym.com/it/daring-joggers-nero-21jg001bn-u-black-21.html';

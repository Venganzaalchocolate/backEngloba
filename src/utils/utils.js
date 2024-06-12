const calcularPrecio=(listajuegos)=>{
    let total=0;
    for (const juego of listajuegos) {
        total+=(juego.quantity*juego.price)   
    }
    total+=total*0.21
    if(total<40)total+=4
    return total
}


module.exports = {
    calcularPrecio
  };
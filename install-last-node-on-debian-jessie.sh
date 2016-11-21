#!/bin/sh

cd /opt
sudo apt-get install python g++ mak
wget http://nodejs.org/dist/node-latest.tar.gz
tar xvfvz node-latest.tar.gz
cd node-v*
./configure
make
sudo make install

